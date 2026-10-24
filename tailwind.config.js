/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode : suit automatiquement le thème de l'OS (nativeTheme = system).
  darkMode: 'media',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette épurée adaptée à un logiciel de gestion.
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8'
        }
      }
    }
  },
  plugins: []
}
