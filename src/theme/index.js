import { createTheme } from '@mui/material/styles';

const getTheme = (storeType) => {
  const isElectronics = storeType === 'electronics';

  return createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: isElectronics ? '#1565C0' : '#5D4037',
        light: isElectronics ? '#1976D2' : '#795548',
        dark: isElectronics ? '#0D47A1' : '#4E342E',
        contrastText: '#fff',
      },
      secondary: {
        main: isElectronics ? '#FF6F00' : '#F57F17',
        light: isElectronics ? '#FF8F00' : '#F9A825',
        dark: isElectronics ? '#E65100' : '#F57F17',
        contrastText: '#fff',
      },
      background: {
        default: '#F5F5F5',
        paper: '#FFFFFF',
      },
      success: { main: '#2E7D32' },
      warning: { main: '#ED6C02' },
      error: { main: '#D32F2F' },
      info: { main: '#0288D1' },
    },
    typography: {
      fontFamily: "'DM Sans', 'Roboto', sans-serif",
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 700,
              backgroundColor: isElectronics ? '#E3F2FD' : '#EFEBE9',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600 },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },
    },
  });
};

export default getTheme;
