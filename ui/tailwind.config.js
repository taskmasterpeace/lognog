/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // LogNog brand teal accent (keep for accents)
        lognog: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // Warm "eggnog" palette for dark mode
        nog: {
          50: '#FAF8F5',   // lightest cream
          100: '#F5F0E8',  // light cream
          200: '#E8DFD0',  // warm white
          300: '#D4C4B0',  // muted tan
          400: '#B8A68E',  // medium tan
          500: '#8B7355',  // warm brown
          600: '#5A3F24',  // chocolate (brand color)
          700: '#3D2A18',  // dark chocolate
          800: '#2D1F13',  // very dark chocolate
          900: '#1E150E',  // near black warm
          950: '#120D09',  // deepest black warm
        },
      },
    },
  },
  plugins: [],
}
