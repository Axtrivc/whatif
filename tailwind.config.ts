import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 浅色基底: ink 通道现在是"墨"(用于文字/深色按钮/描边), 背景为白
        ink: {
          950: '#111114', // 最深文字
          900: '#1d1d21', // 次级文字/深底卡片(深色按钮面)
          800: '#2a2a2f',
          700: '#3a3a41',
        },
        // 极简白底 + 双色语义: 红=涨/强调, 青绿=跌/定投; 加深一档保证白底对比度
        up: '#111114',
        gain: '#d42b3a', // 涨/盈利/关键词点缀(暖红, 白底可读)
        profit: '#d42b3a',
        loss: '#0e9f76', // 跌(语义青绿, 白底可读)
        dca: '#0e9f76', // 定投模式标签(青绿)
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
