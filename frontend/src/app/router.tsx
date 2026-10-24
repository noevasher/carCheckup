import { createBrowserRouter } from 'react-router';
import { Spinner } from '../design/components';
import { env } from '../lib/env';
import { RequireAuth } from '../features/auth/RequireAuth';
import { HomePage } from '../features/home/HomePage';
import { AppLayout } from './AppLayout';

// Home (the critical capture flow) ships in the main bundle; other screens load on demand.
function PageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-primary">
      <Spinner />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    HydrateFallback: PageLoading,
    children: [
      {
        // Public: email unsubscribe link (feature 003, FR-014).
        path: '/unsubscribe',
        lazy: async () => ({
          Component: (await import('../features/notifications/UnsubscribePage')).UnsubscribePage,
        }),
      },
      {
        path: '/login',
        lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              {
                path: '/vehicles/new',
                lazy: async () => ({
                  Component: (await import('../features/vehicles/NewVehiclePage')).NewVehiclePage,
                }),
              },
              {
                path: '/vehicles/:id/edit',
                lazy: async () => ({
                  Component: (await import('../features/vehicles/EditVehiclePage')).EditVehiclePage,
                }),
              },
              {
                path: '/vehicles/:id/maintenance',
                lazy: async () => ({
                  Component: (await import('../features/maintenance/MaintenanceDetailPage'))
                    .MaintenanceDetailPage,
                }),
              },
              {
                path: '/vehicles/:id/services',
                lazy: async () => ({
                  Component: (await import('../features/services/ServicesHistoryPage'))
                    .ServicesHistoryPage,
                }),
              },
              {
                path: '/vehicles/:id/history',
                lazy: async () => ({
                  Component: (await import('../features/readings/HistoryPage')).HistoryPage,
                }),
              },
              // Donations (feature 004).
              {
                path: '/support',
                lazy: async () => ({
                  Component: (await import('../features/donations/SupportPage')).SupportPage,
                }),
              },
              {
                path: '/support/result',
                lazy: async () => ({
                  Component: (await import('../features/donations/ResultPage')).ResultPage,
                }),
              },
              {
                path: '/support/history',
                lazy: async () => ({
                  Component: (await import('../features/donations/MyDonationsPage'))
                    .MyDonationsPage,
                }),
              },
              // Simulated checkout: development and e2e only (research R8).
              ...(import.meta.env.DEV || env.VITE_FAKE_PAYMENTS === '1'
                ? [
                    {
                      path: '/support/fake-checkout',
                      lazy: async () => ({
                        Component: (await import('../features/donations/FakeCheckoutPage'))
                          .FakeCheckoutPage,
                      }),
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    ],
  },
]);
