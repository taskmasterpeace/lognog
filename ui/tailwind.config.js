/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: '0.625rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        // Honey-gold accent (brand) — see ui/BRANDING.md
        honey: {
          50: '#FBF3E3',
          100: '#F6E4C2',
          200: '#EFD194',
          300: '#E6BB63',
          400: '#DCA23E',
          500: '#C8862B',
          600: '#A66A1E',
          700: '#845117',
          800: '#5E3A12',
          900: '#3D260C',
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
