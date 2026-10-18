import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { IS_PREVIEW } from './config/env';

// The preview host cannot serve deep links, so the beta keeps its route in memory.
const Router = IS_PREVIEW ? MemoryRouter : BrowserRouter;
import './i18n';
import './index.css';
import { AppProvider } from './data/store';
import { CatalogProvider } from './data/catalog';
import { NotificationsProvider } from './data/notifications';
import { ConfirmProvider } from './components/confirm';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <CatalogProvider>
        <AppProvider>
          <NotificationsProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </NotificationsProvider>
        </AppProvider>
      </CatalogProvider>
    </Router>
  </React.StrictMode>,
);
