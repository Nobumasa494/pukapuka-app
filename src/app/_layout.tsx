import { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export default function RootLayout() {
  const pathname = usePathname();
  const startedRef = useRef(false);

  // 起動・再読み込みは必ず川（メイン画面）から。Expo Go は再読み込みで最後に開いていた画面から再開してしまう
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (pathname !== '/') router.replace('/');
  }, [pathname]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexProvider client={convex}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          {/* 遷移動画の最後のコマと背景が同じ絵なので、フェードなら切り替わりが見えない */}
          <Stack.Screen name="words" options={{ animation: 'fade' }} />
        </Stack>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
