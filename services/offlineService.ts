import type { Message } from '../types';

const OFFLINE_QUEUE_KEY = 'kissanMitraOfflineQueue';

export interface QueuedMessage {
  inputText: string;
  imageFile?: {
    dataUrl: string;
    type: string;
  };
  timestamp: number;
}

// Helper to convert a File to a Data URL for storage
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to convert a Data URL back to a File object
const dataUrlToFile = (dataUrl: string, filename: string, mimeType: string): File => {
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type: mimeType});
}


export const offlineService = {
  getQueue: (): QueuedMessage[] => {
    try {
      const queueJson = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error("Failed to get offline queue:", error);
      return [];
    }
  },

  saveQueue: (queue: QueuedMessage[]): void => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  },

  addToQueue: async (inputText: string, imageFile: File | null): Promise<void> => {
    const queue = offlineService.getQueue();
    const newQueuedMessage: QueuedMessage = {
      inputText,
      timestamp: Date.now(),
    };

    if (imageFile) {
        try {
            const dataUrl = await fileToDataUrl(imageFile);
            newQueuedMessage.imageFile = { dataUrl, type: imageFile.type };
        } catch (error) {
            console.error("Could not process image for offline queue:", error);
            // Decide if you still want to queue the message without the image
        }
    }

    queue.push(newQueuedMessage);
    offlineService.saveQueue(queue);
  },

  syncQueue: async (
    sendMessage: (inputText: string, imageFile: File | null) => Promise<void>
  ): Promise<void> => {
    const queue = offlineService.getQueue();
    if (queue.length === 0) return;

    // Clear queue immediately to prevent race conditions
    offlineService.saveQueue([]);

    console.log(`Syncing ${queue.length} offline messages...`);
    for (const item of queue) {
        let imageFile: File | null = null;
        if (item.imageFile) {
            imageFile = dataUrlToFile(
                item.imageFile.dataUrl,
                `offline-capture-${item.timestamp}.jpg`,
                item.imageFile.type
            );
        }
      // We add a small delay between sending messages to avoid overwhelming the API
      await sendMessage(item.inputText, imageFile);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  },
};
