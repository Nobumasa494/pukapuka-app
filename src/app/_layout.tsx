import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { WordsProvider } from '../context/WordsContext';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexProvider client={convex}>
        <WordsProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </WordsProvider>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
