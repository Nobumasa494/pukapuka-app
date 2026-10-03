import React, { useContext, useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { TransitionContext } from '../context/TransitionContext';

export function TransitionOverlay() {
  const { transitionState, transitionProgress } = useContext(TransitionContext);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (transitionState === 'to-archive' || transitionState === 'to-home') {
      transitionProgress.value = withTiming(1, {
        duration: 1400,
        easing: Easing.inOut(Easing.cubic)
      });
    }
  }, [transitionState, transitionProgress]);

  const overlayOpacity = useAnimatedStyle(() => {
    const isReverse = transitionState === 'to-home';
    const progress = isReverse ? 1 - transitionProgress.value : transitionProgress.value;
    return {
      opacity: interpolate(
        progress,
        [0, 0.5, 1],
        [0, 0.5, isReverse ? 0 : 1],
        Extrapolate.CLAMP
      ),
    };
  });

  const bubblesScale = useAnimatedStyle(() => {
    const isReverse = transitionState === 'to-home';
    return {
      transform: [
        {
          scale: interpolate(
            isReverse ? 1 - transitionProgress.value : transitionProgress.value,
            [0, 1],
            [1, 0.3],
            Extrapolate.CLAMP
          ),
        },
        {
          translateY: interpolate(
            isReverse ? 1 - transitionProgress.value : transitionProgress.value,
            [0, 1],
            [0, -height * 0.6],
            Extrapolate.CLAMP
          ),
        },
      ],
      opacity: interpolate(
        isReverse ? 1 - transitionProgress.value : transitionProgress.value,
        [0, 0.7, 1],
        [1, 0.8, 0],
        Extrapolate.CLAMP
      ),
    };
  });

  const starOpacity = useAnimatedStyle(() => {
    const isReverse = transitionState === 'to-home';
    return {
      opacity: interpolate(
        isReverse ? 1 - transitionProgress.value : transitionProgress.value,
        [0.5, 1],
        [0, 1],
        Extrapolate.CLAMP
      ),
    };
  });

  if (transitionState === 'idle') return null;

  console.log('TransitionOverlay rendering', { transitionState, progress: transitionProgress.value });

  return (
    <>
      {/* 背景グラデーション遷移 */}
      <Animated.View style={[styles.overlay, overlayOpacity]} pointerEvents="none">
        <LinearGradient
          colors={['#06101e', '#0a1830', '#0e2240', '#122848', '#162c42']}
          style={styles.nightSky}
        />
      </Animated.View>

      {/* 浮遊する泡のエフェクト */}
      <Animated.View style={[styles.bubblesContainer, bubblesScale]} pointerEvents="none">
        <Animated.View
          style={[
            styles.floatingBubble,
            {
              left: width * 0.3,
              top: height * 0.3,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.floatingBubble,
            {
              left: width * 0.6,
              top: height * 0.4,
              width: 50,
              height: 50,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.floatingBubble,
            {
              left: width * 0.2,
              top: height * 0.5,
              width: 35,
              height: 35,
            },
          ]}
        />
      </Animated.View>

      {/* 星のシンボル */}
      <Animated.View style={[styles.starsContainer, starOpacity]} pointerEvents="none">
        <Animated.Text style={styles.star}>✨</Animated.Text>
        <Animated.Text style={[styles.star, { left: width * 0.3, top: height * 0.2 }]}>
          ⭐
        </Animated.Text>
        <Animated.Text style={[styles.star, { left: width * 0.7, top: height * 0.35 }]}>
          ⭐
        </Animated.Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    pointerEvents: 'none',
  },
  nightSky: {
    flex: 1,
  },
  bubblesContainer: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    bottom: -100,
    zIndex: 101,
    overflow: 'visible' as any,
  },
  floatingBubble: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(60,140,190,0.22)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  starsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 102,
  },
  star: {
    position: 'absolute',
    fontSize: 32,
  },
});
