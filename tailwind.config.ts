import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#09090b',
          900: '#101012',
          800: '#17171a',
          700: '#202024',
        },
        // 极简: 唯一强调 = 白(交互态用白透明度阶梯); 语义涨跌独立
        up: '#ffffff',
        profit: '#e05560', // 涨(语义红, 仅数字/曲线)
        loss: '#2fbf9a', // 跌(语义青绿)
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
