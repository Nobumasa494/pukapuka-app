import { useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

export default function RiverBackground() {
  const { width: W, height: H } = useWindowDimensions();

  // 画面を縦に分割: 上55%が空、下45%が川
  const skyH = H * 0.55;
  const riverY = H * 0.52;

  // 遠い山のパス
  const farMountain = `
    M 0 ${H * 0.52}
    C ${W * 0.08} ${H * 0.28}, ${W * 0.18} ${H * 0.22}, ${W * 0.3} ${H * 0.28}
    C ${W * 0.38} ${H * 0.32}, ${W * 0.44} ${H * 0.22}, ${W * 0.55} ${H * 0.19}
    C ${W * 0.65} ${H * 0.16}, ${W * 0.72} ${H * 0.24}, ${W * 0.82} ${H * 0.22}
    C ${W * 0.9} ${H * 0.20}, ${W * 0.96} ${H * 0.28}, ${W} ${H * 0.34}
    L ${W} ${H * 0.54} L 0 ${H * 0.54} Z
  `;

  // 近い山のパス
  const nearMountain = `
    M 0 ${H * 0.54}
    C ${W * 0.12} ${H * 0.36}, ${W * 0.22} ${H * 0.32}, ${W * 0.32} ${H * 0.38}
    C ${W * 0.42} ${H * 0.44}, ${W * 0.5} ${H * 0.30}, ${W * 0.62} ${H * 0.28}
    C ${W * 0.72} ${H * 0.26}, ${W * 0.82} ${H * 0.34}, ${W} ${H * 0.42}
    L ${W} ${H * 0.55} L 0 ${H * 0.55} Z
  `;

  // 背後の木々（左側）
  const backTreesLeft = `
    M 0 ${H * 0.62}
    L ${W * 0.04} ${H * 0.46} L ${W * 0.06} ${H * 0.62}
    L ${W * 0.09} ${H * 0.44} L ${W * 0.11} ${H * 0.62}
    L ${W * 0.15} ${H * 0.47} L ${W * 0.17} ${H * 0.62}
    L ${W * 0.21} ${H * 0.45} L ${W * 0.23} ${H * 0.62}
    L ${W * 0.27} ${H * 0.48} L ${W * 0.29} ${H * 0.62}
    L ${W * 0.33} ${H * 0.46} L ${W * 0.35} ${H * 0.62}
    L ${W * 0.39} ${H * 0.49} L ${W * 0.41} ${H * 0.62}
    L ${W * 0.45} ${H * 0.46} L ${W * 0.48} ${H * 0.62}
    L 0 ${H * 0.62} Z
  `;

  // 背後の木々（右側）
  const backTreesRight = `
    M ${W * 0.52} ${H * 0.60}
    L ${W * 0.56} ${H * 0.44} L ${W * 0.58} ${H * 0.60}
    L ${W * 0.62} ${H * 0.46} L ${W * 0.64} ${H * 0.60}
    L ${W * 0.68} ${H * 0.45} L ${W * 0.70} ${H * 0.60}
    L ${W * 0.74} ${H * 0.47} L ${W * 0.76} ${H * 0.60}
    L ${W * 0.80} ${H * 0.44} L ${W * 0.82} ${H * 0.60}
    L ${W * 0.86} ${H * 0.46} L ${W * 0.88} ${H * 0.60}
    L ${W * 0.92} ${H * 0.48} L ${W * 0.94} ${H * 0.60}
    L ${W * 0.98} ${H * 0.45} L ${W} ${H * 0.60}
    L ${W} ${H * 0.60} L ${W * 0.52} ${H * 0.60} Z
  `;

  // 前景の木々（左）
  const frontTreesLeft = `
    M 0 ${H}
    L 0 ${H * 0.72}
    L ${W * 0.04} ${H * 0.52} L ${W * 0.07} ${H * 0.72}
    L ${W * 0.10} ${H * 0.50} L ${W * 0.14} ${H * 0.72}
    L ${W * 0.18} ${H * 0.54} L ${W * 0.22} ${H * 0.72}
    L ${W * 0.26} ${H * 0.52} L ${W * 0.28} ${H}
    L 0 ${H} Z
  `;

  // 前景の木々（右）
  const frontTreesRight = `
    M ${W} ${H}
    L ${W} ${H * 0.70}
    L ${W * 0.96} ${H * 0.50} L ${W * 0.92} ${H * 0.70}
    L ${W * 0.88} ${H * 0.48} L ${W * 0.84} ${H * 0.70}
    L ${W * 0.80} ${H * 0.52} L ${W * 0.76} ${H * 0.70}
    L ${W * 0.72} ${H * 0.50} L ${W * 0.72} ${H}
    L ${W} ${H} Z
  `;

  // 川の縁（木の土台）
  const woodRim = `M 0 ${H * 0.86} L ${W} ${H * 0.86} L ${W} ${H} L 0 ${H} Z`;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 空グラデーション */}
      <LinearGradient
        colors={['#7a2e12', '#a84520', '#cc6830', '#e09050', '#d4c078', '#98c0cc', '#6898b0']}
        locations={[0, 0.12, 0.28, 0.44, 0.60, 0.78, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: skyH }}
      />

      {/* 川グラデーション */}
      <LinearGradient
        colors={['#3a8090', '#4a9caa', '#3a8898', '#2c7080', '#1e5868']}
        locations={[0, 0.25, 0.55, 0.8, 1]}
        style={{ position: 'absolute', top: riverY, left: 0, right: 0, bottom: 0 }}
      />

      {/* SVGレイヤー */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="farMtnGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5a6880" />
            <Stop offset="1" stopColor="#4a5870" />
          </SvgGradient>
          <SvgGradient id="nearMtnGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3c4a60" />
            <Stop offset="1" stopColor="#2c3a50" />
          </SvgGradient>
          <SvgGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3a2210" />
            <Stop offset="0.3" stopColor="#4a2c14" />
            <Stop offset="1" stopColor="#271508" />
          </SvgGradient>
        </Defs>

        {/* 遠い山 */}
        <Path d={farMountain} fill="url(#farMtnGrad)" />

        {/* 近い山 */}
        <Path d={nearMountain} fill="url(#nearMtnGrad)" />

        {/* 背後の木々 */}
        <Path d={backTreesLeft} fill="#1e3c22" />
        <Path d={backTreesRight} fill="#182e1a" />

        {/* 前景の木々 */}
        <Path d={frontTreesLeft} fill="#0e1a14" />
        <Path d={frontTreesRight} fill="#0a1610" />

        {/* 露天風呂の木の縁 */}
        <Path d={woodRim} fill="url(#woodGrad)" />
      </Svg>

      {/* 太陽グロー */}
      <LinearGradient
        colors={['rgba(255,228,140,0.28)', 'rgba(255,200,90,0.10)', 'rgba(255,180,70,0)']}
        locations={[0, 0.4, 1]}
        style={{
          position: 'absolute',
          top: H * 0.05,
          left: W * 0.3,
          width: W * 0.7,
          height: H * 0.45,
          borderRadius: W * 0.5,
        }}
      />

      {/* 水面の金色の反射 */}
      <LinearGradient
        colors={['rgba(255,218,140,0)', 'rgba(255,228,160,0.20)', 'rgba(230,200,130,0)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: 'absolute',
          top: riverY,
          left: W * 0.15,
          right: W * 0.15,
          height: H * 0.25,
        }}
      />

      {/* 温泉旅館の灯り（左側のオレンジグロー） */}
      <LinearGradient
        colors={['rgba(255,185,55,0.32)', 'rgba(255,150,38,0.12)', 'rgba(255,120,25,0)']}
        locations={[0, 0.4, 1]}
        style={{
          position: 'absolute',
          top: H * 0.38,
          left: 0,
          width: W * 0.45,
          height: H * 0.35,
          borderRadius: W * 0.4,
        }}
      />
    </View>
  );
}
