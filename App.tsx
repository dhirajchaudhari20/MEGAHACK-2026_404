
import React, { useState, useEffect, useCallback } from 'react';
import type { Message, LanguageCode, Theme, ChatMetadata } from './types';
import Header from './components/Header';
import ContextSelector from './components/ContextSelector';
import ChatInterface from './components/ChatInterface';
import Footer from './components/Footer';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import useAuth from './hooks/useAuth';
import { getAIResponse } from './services/geminiService';
import { databaseService } from './services/databaseService';
import { INDIAN_STATES_DISTRICTS, COMMON_CROPS, TRANSLATIONS } from './constants';
import { offlineService } from './services/offlineService';
import Preloader from './components/Preloader';
import ConfirmationModal from './components/ConfirmationModal';
import AboutModal from './components/AboutModal';
import OfficerDashboard from './components/OfficerDashboard';
import NewsSection from './components/NewsSection';

const THEME_KEY = 'kissanMitraTheme';

const App: React.FC = () => {
  const { user, language: savedLanguage, state: savedState, district: savedDistrict, login, logout, setLanguage: setAuthLanguage, isLoading: isAuthLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [language, setLanguage] = useState<LanguageCode>(savedLanguage);
  
  const [context, setContext] = useState({
    state: savedState || Object.keys(INDIAN_STATES_DISTRICTS)[0],
    district: savedDistrict || INDIAN_STATES_DISTRICTS[savedState || Object.keys(INDIAN_STATES_DISTRICTS)[0]][0],
    crop: COMMON_CROPS[0],
  });

  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [currentView, setCurrentView] = useState<'chat' | 'dashboard' | 'news'>('dashboard');
  const [confirmation, setConfirmation] = useState<{
    action: () => void;
    title: string;
    message: string;
  } | null>(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [hackathonMode, setHackathonMode] = useState(false);

  useEffect(() => {
    setLanguage(savedLanguage);
  }, [savedLanguage]);

  useEffect(() => {
    // Sync app context with any changes from auth (e.g., on initial load)
    setContext(prev => ({
        ...prev,
        state: savedState || Object.keys(INDIAN_STATES_DISTRICTS)[0],
        district: savedDistrict || INDIAN_STATES_DISTRICTS[savedState || Object.keys(INDIAN_STATES_DISTRICTS)[0]][0]
    }));
  }, [savedState, savedDistrict]);

  // Effect to manage online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      offlineService.syncQueue(handleSendMessage);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (isOnline) {
      offlineService.syncQueue(handleSendMessage);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); 


  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const loadChats = useCallback(async () => {
      const chatList = await databaseService.getAllChatMetadata();
      setChats(chatList);
  }, []);

  useEffect(() => {
    if (user) {
        loadChats();
        if (!activeChatId) {
            handleNewChat(false); // Don't switch view on initial load
        }
    }
  }, [user, activeChatId, loadChats]);

  useEffect(() => {
      if (activeChatId === null) {
          setMessages([
              {
                  id: 'initial-message',
                  role: 'model',
                  text: TRANSLATIONS.initialMessage[language],
                  timestamp: new Date(),
              },
          ]);
      }
  }, [activeChatId, language]);

  const handleLanguageChange = (newLanguage: LanguageCode) => {
    setLanguage(newLanguage);
    setAuthLanguage(newLanguage);
  };

  const handleSendMessage = useCallback(async (inputText: string, imageFile: File | null) => {
    if (!inputText.trim() && !imageFile) return;

    setCurrentView('chat');

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: inputText,
      image: imageFile ? URL.createObjectURL(imageFile) : undefined,
      timestamp: new Date(),
    };
    
    // This logic ensures that if we are starting a new chat, the old "initial message" is cleared.
    const currentMessages = activeChatId === null ? [] : messages;
    const updatedMessages = [...currentMessages, userMessage];
    setMessages(updatedMessages);

    if (!navigator.onLine) {
        await offlineService.addToQueue(inputText, imageFile);
        setMessages((prev) => [...prev, {
            id: 'offline-notice',
            role: 'model',
            text: 'You are offline. Your message has been queued and will be sent when you reconnect.',
            timestamp: new Date()
        }]);
        return;
    }

    setIsLoading(true);
    setIsStreaming(false);

    let currentChatId = activeChatId;

    if (currentChatId === null) {
        const newChatId = `chat-${Date.now()}`;
        const title = inputText.split(' ').slice(0, 5).join(' ') || 'New Chat';
        await databaseService.addOrUpdateChat({ id: newChatId, title, timestamp: new Date(), messages: [userMessage] });
        setActiveChatId(newChatId);
        currentChatId = newChatId;
        loadChats(); 
    } else {
        // For existing chats, just add the new user message to the database
        const chatToSave = await databaseService.getChat(currentChatId);
        if (chatToSave) {
            chatToSave.messages.push(userMessage);
            await databaseService.addOrUpdateChat(chatToSave);
        }
    }

    try {
      const stream = await getAIResponse(inputText, imageFile, { state: context.state, district: context.district, crop: context.crop }, language);
      setIsLoading(false);
      setIsStreaming(true);

      const modelMessageId = `model-${Date.now()}`;
      const initialModelMessage: Message = {
        id: modelMessageId,
        role: 'model',
        text: '',
        timestamp: new Date(),
      };
      // Use the updatedMessages which already includes the user's message
      setMessages([...updatedMessages, initialModelMessage]);

      let aggregatedText = '';
      for await (const chunk of stream) {
        aggregatedText += chunk.text;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === modelMessageId ? { ...msg, text: aggregatedText } : msg
          )
        );
      }
       
      const finalModelMessage = { ...initialModelMessage, text: aggregatedText };
      const chatToSave = await databaseService.getChat(currentChatId!);
      if(chatToSave){
          chatToSave.messages.push(finalModelMessage);
          await databaseService.addOrUpdateChat(chatToSave);
      }

    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'model',
        text: TRANSLATIONS.errorMessage[language],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [context, language, messages, activeChatId, loadChats]);

  const handleNewChat = (switchView = true) => {
    setActiveChatId(null);
    setMessages([]); // Clears messages for the new chat
    if (switchView) setCurrentView('chat');
    if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
    }
  };

  const handleSelectChat = async (id: string) => {
      const chat = await databaseService.getChat(id);
      if (chat) {
          setActiveChatId(chat.id);
          setMessages(chat.messages);
          setCurrentView('chat');
      }
      if (window.innerWidth <= 768) {
          setIsSidebarOpen(false);
      }
  };

  const handleDeleteChat = async (id: string) => {
    setConfirmation({
        title: TRANSLATIONS.deleteChatConfirmTitle[language],
        message: TRANSLATIONS.deleteChatConfirmMessage[language],
        action: async () => {
            await databaseService.deleteChat(id);
            if (activeChatId === id) {
                handleNewChat(false);
                setCurrentView('dashboard');
            }
            loadChats();
        }
    });
  };
  
  const handleLogout = () => {
    setConfirmation({
        title: TRANSLATIONS.logoutConfirmTitle[language],
        message: TRANSLATIONS.logoutConfirmMessage[language],
        action: () => {
            logout();
            setChats([]);
            setActiveChatId(null);
            setMessages([]);
        }
    });
  };
  
  const isNewChat = activeChatId === null;

  if (isAuthLoading) {
    return <Preloader />;
  }

  if (window.location.pathname === '/officer') {
    return <OfficerDashboard language={language} />;
  }

  if (!user) {
    return <LoginScreen onLogin={login} initialLanguage={language} />;
  }

  return (
    <div className="flex h-screen text-gray-800 dark:text-gray-200 bg-slate-50 dark:bg-[#0D1117]">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-10 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar 
          isOpen={isSidebarOpen}
          chats={chats}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          language={language}
          currentView={currentView}
          onSetView={setCurrentView}
          user={user}
          onLogout={handleLogout}
          onOpenAboutModal={() => setIsAboutModalOpen(true)}
      />
      <div className="flex flex-col flex-1 h-screen">
        <Header 
          language={language} 
          onLanguageChange={handleLanguageChange}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          hackathonMode={hackathonMode}
          onToggleHackathonMode={() => setHackathonMode(!hackathonMode)}
        />
        <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-2 sm:p-4 overflow-hidden">
          {!isOnline && (
              <div className="bg-yellow-500/20 border border-yellow-600/30 text-yellow-800 dark:text-yellow-200 text-sm rounded-lg p-3 mb-4 text-center">
                  You are currently offline. Messages will be sent when you reconnect.
              </div>
          )}
          {currentView === 'chat' && (
            <ContextSelector
              state={context.state}
              district={context.district}
              crop={context.crop}
              onStateChange={(st) => setContext((prev) => ({ ...prev, state: st, district: INDIAN_STATES_DISTRICTS[st][0] }))}
              onDistrictChange={(dist) => setContext((prev) => ({ ...prev, district: dist }))}
              onCropChange={(crp) => setContext((prev) => ({ ...prev, crop: crp }))}
              language={language}
            />
          )}
          
          <div className="flex-1 overflow-y-auto relative">
            {currentView === 'chat' ? (
                <ChatInterface
                    messages={messages}
                    isLoading={isLoading}
                    isStreaming={isStreaming}
                    onSendMessage={handleSendMessage}
                    language={language}
                    isNewChat={isNewChat}
                    isOnline={isOnline}
                    location={context.district}
                    user={user}
                />
            ) : currentView === 'news' ? (
                <NewsSection 
                    language={language} 
                    state={context.state} 
                    district={context.district} 
                />
            ) : (
                <Dashboard language={language} location={context.district} />
            )}
           </div>

        </main>
        <Footer language={language} />
      </div>
      <ConfirmationModal
        isOpen={!!confirmation}
        onClose={() => setConfirmation(null)}
        onConfirm={confirmation?.action || (() => {})}
        title={confirmation?.title || ''}
        message={confirmation?.message || ''}
        language={language}
      />
      <AboutModal 
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        language={language}
      />
    </div>
  );
};

export default App;
