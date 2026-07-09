import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const memoryStore = new Map<string, string>();

const webStorage = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const storage = {
  async secureGet(key: string, fallback = "") {
    const local = webStorage();
    if (local) return local.getItem(key) ?? fallback;
    if (Platform.OS === "web") return memoryStore.get(key) ?? fallback;
    return (await SecureStore.getItemAsync(key)) ?? fallback;
  },

  async secureSet(key: string, value: string) {
    const local = webStorage();
    if (local) {
      local.setItem(key, value);
      return;
    }
    if (Platform.OS === "web") {
      memoryStore.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async secureRemove(key: string) {
    const local = webStorage();
    if (local) {
      local.removeItem(key);
      return;
    }
    if (Platform.OS === "web") {
      memoryStore.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
