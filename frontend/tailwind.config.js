/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#d9f3f0',
          DEFAULT: '#00877f',
          dark: '#006b65',
        },
        surface: '#ffffff',
        background: '#f7fbfa',
        text: {
          DEFAULT: '#083d3a',
          muted: '#5b7773',
        }
      }
    },
  },
  plugins: [],
}
