import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import { AppProvider } from './data/store';
import { CatalogProvider } from './data/catalog';
import { NotificationsProvider } from './data/notifications';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <CatalogProvider>
        <AppProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </AppProvider>
      </CatalogProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
