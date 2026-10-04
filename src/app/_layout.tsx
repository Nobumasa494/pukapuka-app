import { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);
const SCREEN_BG = '#1a1c45';

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
    // 画面を切り替える途中で前後の画面が半透明になると土台の色が透ける。既定の白だと画面が白く光るので、空の藍色にする
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: SCREEN_BG }}>
      <ConvexProvider client={convex}>
        <StatusBar style="light" />
        {/* 拾ったことばは川の画面の上に重ねて出す（画面は切り替えない）。画面を切り替えると Android で下の画面の
            動画の描画面が捨てられ、戻ったときに黒くなった */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: SCREEN_BG } }} />
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
