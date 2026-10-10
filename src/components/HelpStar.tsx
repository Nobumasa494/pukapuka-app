import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

// 右上の「見方」の印。星空（「星の見方」）とわたしのこと（「わたしのことの見方」）で同じ形を、画面の色で使う
// 右上の「星の見方」の印（4つの角の星。「?」はつけない：ユーザー「はてなマークいらないかも」2026-10-10）
const HELP_STAR = 'M15 3l1.6 6.4L23 11l-6.4 1.6L15 19l-1.6-6.4L7 11l6.4-1.6z';

const HELP_TWINKLE_EVERY_MS = 4000;
const HELP_GLINT = 24;
// 右上の「星の見方」の印。色は星座の線と同じ金色を、ひかえめに（白だと浮いた。ユーザー「色を変えたほうが良いかも」→ B 2026-10-10）。
// 押せると分かるように、4秒に1回「きらん」と光る（水辺の月と星と同じ。ユーザー「きらんと光ってほしい４秒に一回ぐらい」2026-10-10）
export default function HelpStar({ color, glint = '#fff4d8' }: { color: string; glint?: string }) {
  const kiran = useSharedValue(0);
  useEffect(() => {
    kiran.set(
      withRepeat(
        withSequence(
          withDelay(HELP_TWINKLE_EVERY_MS - 700, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) })),
          withTiming(0, { duration: 500, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(kiran);
  }, [kiran]);
  const iconStyle = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * kiran.value }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: kiran.value,
    transform: [{ scale: 0.3 + 0.9 * kiran.value }, { rotate: `${kiran.value * 20}deg` }],
  }));
  const g = HELP_GLINT;
  return (
    <View style={{ width: 32, height: 32 }}>
      <Animated.View style={iconStyle}>
        <Svg width={32} height={32} viewBox="0 -4 30 30">
          <Path d={HELP_STAR} fill={color} />
        </Svg>
      </Animated.View>
      {/* 星の真ん中（32px の箱の真ん中）に、細い十字の光 */}
      <Animated.View style={[{ position: 'absolute', left: 16 - g / 2, top: 16 - g / 2, width: g, height: g, pointerEvents: 'none' }, glintStyle]}>
        <Svg width={g} height={g}>
          <Path d={`M${g / 2} 0 L${g / 2 + 0.9} ${g / 2} L${g / 2} ${g} L${g / 2 - 0.9} ${g / 2} Z`} fill={glint} />
          <Path d={`M0 ${g / 2} L${g / 2} ${g / 2 - 0.9} L${g} ${g / 2} L${g / 2} ${g / 2 + 0.9} Z`} fill={glint} />
          <Circle cx={g / 2} cy={g / 2} r={2} fill="#fffaf0" />
        </Svg>
      </Animated.View>
    </View>
  );
}

