'use client';

import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, base, arbitrum } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
  appName: 'RefiFi',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Get free at cloud.walletconnect.com
  chains: [mainnet, base, arbitrum],
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#4fffb0',
            accentColorForeground: '#04060f',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
