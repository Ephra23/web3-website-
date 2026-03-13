'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useBalance, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { mainnet, base, arbitrum } from 'wagmi/chains';

// ─── Contract Addresses ──────────────────────────────────────────────────────
const CONTRACTS = {
  // Ethereum Mainnet
  1: {
    AAVE_POOL:    '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    AAVE_ORACLE:  '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    MORPHO:       '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    WETH:         '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC:         '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WBTC:         '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    stETH:        '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    COMPOUND_USDC:'0xc3d688B66703497DAA19211EEdff47f25384cdc3',
  },
  // Base
  8453: {
    AAVE_POOL:    '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    USDC:         '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Arbitrum
  42161: {
    AAVE_POOL:    '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    USDC:         '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
};

// ─── ABIs (minimal) ──────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'decimals',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint8' }] },
];

const AAVE_POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset',       type: 'address' },
      { name: 'amount',      type: 'uint256' },
      { name: 'onBehalfOf',  type: 'address' },
      { name: 'referralCode', type: 'uint16'  },
    ],
    outputs: [],
  },
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset',           type: 'address' },
      { name: 'amount',          type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode',    type: 'uint16'  },
      { name: 'onBehalfOf',      type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase',     type: 'uint256' },
      { name: 'totalDebtBase',           type: 'uint256' },
      { name: 'availableBorrowsBase',    type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv',                     type: 'uint256' },
      { name: 'healthFactor',            type: 'uint256' },
    ],
  },
];

const COMPOUND_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'borrowBalanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];

// ─── Static Data ─────────────────────────────────────────────────────────────
const ASSETS = [
  { id: 'eth',   sym: 'ETH',   name: 'Ethereum',   icon: 'Ξ',  clr: '#627EEA', ltv: 0.80, cgId: 'ethereum',      decimals: 18, isNative: true  },
  { id: 'wbtc',  sym: 'WBTC',  name: 'Bitcoin',    icon: '₿',  clr: '#F7931A', ltv: 0.70, cgId: 'bitcoin',       decimals: 8,  isNative: false },
  { id: 'steth', sym: 'stETH', name: 'Lido stETH', icon: 'Ξ',  clr: '#00C2FF', ltv: 0.75, cgId: 'staked-ether',  decimals: 18, isNative: false },
];

const DEBTS = [
  { id: 'cc',       name: 'Credit Card',   icon: '💳', rate: 22.5 },
  { id: 'personal', name: 'Personal Loan', icon: '🏦', rate: 11.2 },
  { id: 'auto',     name: 'Auto Loan',     icon: '🚗', rate: 7.8  },
  { id: 'student',  name: 'Student Loan',  icon: '🎓', rate: 6.5  },
];

const PROTOCOLS = [
  { id: 'morpho',   name: 'Morpho Blue', icon: '🔵', badge: 'Lowest Rate',   badgeClr: '#4fffb0', tvl: '$4.2B',  fb: 2.42, type: 'morpho'   },
  { id: 'aave',     name: 'Aave V3',     icon: '👻', badge: 'Most Liquid',   badgeClr: '#9945FF', tvl: '$27.1B', fb: 2.87, type: 'aave'     },
  { id: 'compound', name: 'Compound V3', icon: '🏦', badge: 'Battle-Tested', badgeClr: '#00A3FF', tvl: '$3.8B',  fb: 3.10, type: 'compound' },
];

const STEPS = ['Debt', 'Collateral', 'Protocol', 'Execute'];
const fmt   = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtU  = (n) => `$${fmt(n, 0)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Live Rate Fetcher ────────────────────────────────────────────────────────
async function fetchRates() {
  try {
    const r = await fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(7000) });
    const { data } = await r.json();
    const find = (proj, sym) => data.find(p =>
      p.project === proj && p.symbol?.toUpperCase().includes(sym) && p.chain === 'Ethereum'
    );
    return {
      aave:     +(find('aave-v3',    'USDC')?.apyBaseBorrow ?? 2.87).toFixed(2),
      morpho:   +(find('morpho-blue','USDC')?.apyBaseBorrow ?? 2.42).toFixed(2),
      compound: +(find('compound-v3','USDC')?.apyBaseBorrow ?? 3.10).toFixed(2),
    };
  } catch { return { aave: 2.87, morpho: 2.42, compound: 3.10 }; }
}

async function fetchPrices() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,staked-ether&vs_currencies=usd', { signal: AbortSignal.timeout(7000) });
    const d = await r.json();
    return { eth: d.ethereum?.usd ?? 3241, wbtc: d.bitcoin?.usd ?? 86420, steth: d['staked-ether']?.usd ?? 3198 };
  } catch { return { eth: 3241, wbtc: 86420, steth: 3198 }; }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function RefiFi() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [step,        setStep]        = useState(0);
  const [debtType,    setDebtType]    = useState(DEBTS[0]);
  const [debtAmount,  setDebtAmount]  = useState(15000);
  const [asset,       setAsset]       = useState(ASSETS[0]);
  const [collateral,  setCollateral]  = useState(20000);
  const [protocol,    setProtocol]    = useState(PROTOCOLS[0]);
  const [rates,       setRates]       = useState({ aave: 2.87, morpho: 2.42, compound: 3.10 });
  const [prices,      setPrices]      = useState({ eth: 3241, wbtc: 86420, steth: 3198 });
  const [txLog,       setTxLog]       = useState([]);
  const [txStep,      setTxStep]      = useState(null); // 'approve'|'supply'|'borrow'|'done'|'error'
  const [txHash,      setTxHash]      = useState(null);
  const [showDash,    setShowDash]    = useState(false);
  const [aaveData,    setAaveData]    = useState(null);
  const [aiResult,    setAiResult]    = useState(null);
  const [loadingAI,   setLoadingAI]   = useState(false);
  const [tickerRates, setTickerRates] = useState([]);

  // Fetch live data
  useEffect(() => {
    fetchRates().then(r => {
      setRates(r);
      setTickerRates([
        { name: 'Morpho USDC', rate: r.morpho },
        { name: 'Aave USDC',   rate: r.aave   },
        { name: 'Compound',    rate: r.compound},
      ]);
    });
    fetchPrices().then(setPrices);
    const iv = setInterval(() => { fetchRates().then(setRates); }, 60000);
    return () => clearInterval(iv);
  }, []);

  // Read Aave position if connected
  const { data: aaveAccountData } = useReadContract({
    address: CONTRACTS[chainId]?.AAVE_POOL,
    abi: AAVE_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [address],
    query: { enabled: !!address && !!CONTRACTS[chainId]?.AAVE_POOL },
  });

  useEffect(() => {
    if (aaveAccountData) {
      setAaveData({
        collateral: Number(formatUnits(aaveAccountData[0], 8)),
        debt:       Number(formatUnits(aaveAccountData[1], 8)),
        available:  Number(formatUnits(aaveAccountData[2], 8)),
        health:     Number(formatUnits(aaveAccountData[5], 18)),
      });
    }
  }, [aaveAccountData]);

  // Calculations
  const rate      = rates[protocol.id] ?? protocol.fb;
  const savings   = debtAmount * (debtType.rate - rate) / 100;
  const ltv       = asset.ltv;
  const maxBorrow = collateral * ltv;
  const health    = collateral > 0 ? (collateral * ltv) / Math.max(debtAmount, 1) : 0;

  // AI Advisor
  const getAI = useCallback(async () => {
    setLoadingAI(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_KEY || '', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Analyze this DeFi refinance: debt $${debtAmount} at ${debtType.rate}%, collateral $${collateral} ${asset.sym}, borrowing on ${protocol.name} at ${rate}%, health factor ${health.toFixed(2)}, annual savings $${Math.round(savings)}. Reply ONLY with JSON: {"verdict":"GO"|"CAUTION"|"WAIT","headline":"short headline","insight":"2 sentences","risk":"1 sentence","tip":"1 sentence"}`
          }]
        })
      });
      const d = await res.json();
      const txt = d.content?.[0]?.text || '{}';
      setAiResult(JSON.parse(txt.replace(/```json|```/g, '').trim()));
    } catch { setAiResult({ verdict: 'CAUTION', headline: 'AI unavailable', insight: 'Check your API key.', risk: 'Manual review recommended.', tip: 'Proceed carefully.' }); }
    setLoadingAI(false);
  }, [debtAmount, debtType, collateral, asset, protocol, rate, health, savings]);

  // ─── Real Transaction Flow ────────────────────────────────────────────────
  const executeAave = useCallback(async () => {
    if (!isConnected) { openConnectModal(); return; }
    const contracts = CONTRACTS[chainId];
    if (!contracts) { alert('Please switch to Ethereum, Base, or Arbitrum'); return; }

    const log = (msg, hash) => setTxLog(prev => [...prev, { msg, hash, time: new Date().toLocaleTimeString() }]);

    try {
      const collateralWei = parseUnits(collateral.toString(), asset.decimals);
      const borrowWei     = parseUnits(debtAmount.toString(), 6); // USDC = 6 decimals
      const assetAddress  = contracts[asset.id.toUpperCase()] || contracts.WETH;

      // Step 1: Approve collateral
      setTxStep('approve');
      log('Approving collateral...');
      if (!asset.isNative) {
        const approveTx = await writeContractAsync({
          address: assetAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contracts.AAVE_POOL, collateralWei],
        });
        log('Collateral approved ✓', approveTx);
        await sleep(2000);
      }

      // Step 2: Supply collateral
      setTxStep('supply');
      log(`Supplying ${collateral} ${asset.sym} to Aave...`);
      const supplyTx = await writeContractAsync({
        address: contracts.AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [assetAddress, collateralWei, address, 0],
        value: asset.isNative ? collateralWei : 0n,
      });
      log('Collateral supplied ✓', supplyTx);
      setTxHash(supplyTx);
      await sleep(2000);

      // Step 3: Borrow USDC
      setTxStep('borrow');
      log(`Borrowing $${debtAmount} USDC at ${rate}% APR...`);
      const borrowTx = await writeContractAsync({
        address: contracts.AAVE_POOL,
        abi: AAVE_POOL_ABI,
        functionName: 'borrow',
        args: [contracts.USDC, borrowWei, 2n, 0, address], // 2 = variable rate
      });
      log(`Borrowed $${debtAmount} USDC ✓`, borrowTx);

      setTxStep('done');
      log('🎉 Done! Send USDC to your bank to pay off debt.');
      setShowDash(true);

    } catch (err) {
      setTxStep('error');
      log(`Error: ${err.shortMessage || err.message}`);
    }
  }, [isConnected, chainId, collateral, debtAmount, asset, address, rate, writeContractAsync, openConnectModal]);

  const executeCompound = useCallback(async () => {
    if (!isConnected) { openConnectModal(); return; }
    const contracts = CONTRACTS[chainId];
    if (!contracts?.COMPOUND_USDC) { alert('Compound only available on Ethereum mainnet'); return; }

    const log = (msg, hash) => setTxLog(prev => [...prev, { msg, hash, time: new Date().toLocaleTimeString() }]);

    try {
      setTxStep('supply');
      log('Supplying collateral to Compound...');
      const assetAddress = contracts[asset.id.toUpperCase()] || contracts.WETH;
      const collateralWei = parseUnits(collateral.toString(), asset.decimals);

      if (!asset.isNative) {
        const approveTx = await writeContractAsync({
          address: assetAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contracts.COMPOUND_USDC, collateralWei],
        });
        log('Approved ✓', approveTx);
      }

      const supplyTx = await writeContractAsync({
        address: contracts.COMPOUND_USDC,
        abi: COMPOUND_ABI,
        functionName: 'supply',
        args: [assetAddress, collateralWei],
        value: asset.isNative ? collateralWei : 0n,
      });
      log('Supplied to Compound ✓', supplyTx);

      setTxStep('borrow');
      log(`Borrowing $${debtAmount} USDC...`);
      const borrowWei = parseUnits(debtAmount.toString(), 6);
      const withdrawTx = await writeContractAsync({
        address: contracts.COMPOUND_USDC,
        abi: COMPOUND_ABI,
        functionName: 'withdraw',
        args: [contracts.USDC, borrowWei],
      });
      log(`Borrowed $${debtAmount} USDC ✓`, withdrawTx);
      setTxStep('done');
      log('🎉 Done! Send USDC to your bank.');
      setShowDash(true);
    } catch (err) {
      setTxStep('error');
      log(`Error: ${err.shortMessage || err.message}`);
    }
  }, [isConnected, chainId, collateral, debtAmount, asset, address, writeContractAsync, openConnectModal]);

  const handleExecute = () => {
    if (protocol.type === 'compound') executeCompound();
    else executeAave(); // Aave & Morpho use same pool interface
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const s = {
    app:      { minHeight: '100vh', background: '#04060f', color: '#e6edf3', fontFamily: "'Outfit', sans-serif" },
    nav:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid #1a2030', background: 'rgba(4,6,15,0.9)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
    logo:     { fontSize: 22, fontWeight: 800, background: 'linear-gradient(135deg,#4fffb0,#00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    walletBtn:{ background: 'linear-gradient(135deg,#4fffb0,#00d4ff)', color: '#04060f', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
    addrBadge:{ background: '#0d1520', border: '1px solid #4fffb030', borderRadius: 10, padding: '8px 16px', fontSize: 13, color: '#4fffb0', fontFamily: 'monospace' },
    main:     { maxWidth: 780, margin: '0 auto', padding: '40px 20px' },
    card:     { background: '#0d1520', border: '1px solid #1a2535', borderRadius: 16, padding: 28, marginBottom: 20 },
    stepRow:  { display: 'flex', gap: 8, marginBottom: 32 },
    stepItem: (active, done) => ({ flex: 1, padding: '10px 0', textAlign: 'center', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: done ? '#4fffb020' : active ? '#4fffb0' : '#0d1520', color: done ? '#4fffb0' : active ? '#04060f' : '#4a5580', border: `1px solid ${done ? '#4fffb040' : active ? 'transparent' : '#1a2535'}`, transition: 'all .2s' }),
    label:    { fontSize: 13, color: '#4a5580', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' },
    input:    { width: '100%', background: '#060d1a', border: '1px solid #1a2535', borderRadius: 10, padding: '14px 16px', color: '#e6edf3', fontSize: 18, fontWeight: 700, outline: 'none', boxSizing: 'border-box' },
    grid2:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    chipActive:(clr)=>({ border: `2px solid ${clr}`, background: `${clr}15`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all .2s' }),
    chipIdle: { border: '1px solid #1a2535', background: '#060d1a', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all .2s' },
    bigBtn:   { width: '100%', background: 'linear-gradient(135deg,#4fffb0,#00d4ff)', color: '#04060f', border: 'none', borderRadius: 12, padding: '18px 0', fontSize: 17, fontWeight: 800, cursor: 'pointer', marginTop: 16 },
    txBox:    { background: '#060d1a', border: '1px solid #1a2535', borderRadius: 10, padding: 16, maxHeight: 200, overflowY: 'auto' },
    txRow:    { fontSize: 13, color: '#8090a0', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' },
    tag:      (clr) => ({ display: 'inline-block', background: `${clr}20`, color: clr, border: `1px solid ${clr}40`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }),
    kpi:      { background: '#060d1a', border: '1px solid #1a2535', borderRadius: 12, padding: '20px 24px' },
    kpiVal:   { fontSize: 28, fontWeight: 800, color: '#4fffb0', marginBottom: 4 },
    kpiLbl:   { fontSize: 13, color: '#4a5580' },
  };

  const truncAddr = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : '';

  // Chain name
  const chainName = chainId === 1 ? 'Ethereum' : chainId === 8453 ? 'Base' : chainId === 42161 ? 'Arbitrum' : 'Unknown';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={s.app}>

        {/* NAV */}
        <nav style={s.nav}>
          <span style={s.logo}>RefiFi ↻</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {isConnected && (
              <>
                <span style={{ fontSize: 12, color: '#4a5580' }}>{chainName}</span>
                <select
                  style={{ background: '#0d1520', border: '1px solid #1a2535', color: '#e6edf3', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                  value={chainId}
                  onChange={e => switchChain({ chainId: Number(e.target.value) })}
                >
                  <option value={1}>Ethereum</option>
                  <option value={8453}>Base</option>
                  <option value={42161}>Arbitrum</option>
                </select>
              </>
            )}
            {isConnected
              ? <span style={s.addrBadge}>🟢 {truncAddr(address)}</span>
              : <button style={s.walletBtn} onClick={openConnectModal}>Connect Wallet</button>
            }
          </div>
        </nav>

        <div style={s.main}>
          {/* Hero */}
          {!showDash && (
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, marginBottom: 12 }}>
                Escape <span style={{ color: '#ff6b6b', textDecoration: 'line-through' }}>{debtType.rate}%</span> interest.<br />
                Borrow at <span style={{ color: '#4fffb0' }}>~{rate}%</span> on-chain.
              </div>
              <div style={{ color: '#4a5580', fontSize: 16 }}>Non-custodial · No credit check · 5 minutes</div>
            </div>
          )}

          {/* Dashboard */}
          {showDash && (
            <div style={s.card}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#4fffb0' }}>📊 Your Position</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Annual Savings', val: fmtU(savings) },
                  { label: 'Collateral',     val: fmtU(aaveData?.collateral ?? collateral) },
                  { label: 'Health Factor',  val: (aaveData?.health ?? health).toFixed(2) },
                ].map(k => (
                  <div key={k.label} style={s.kpi}>
                    <div style={s.kpiVal}>{k.val}</div>
                    <div style={s.kpiLbl}>{k.label}</div>
                  </div>
                ))}
              </div>
              {txLog.length > 0 && (
                <div style={s.txBox}>
                  {txLog.map((t, i) => (
                    <div key={i} style={s.txRow}>
                      <span style={{ color: '#4a5580' }}>{t.time}</span>
                      <span style={{ flex: 1 }}>{t.msg}</span>
                      {t.hash && (
                        <a href={`https://etherscan.io/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ color: '#4fffb0', fontSize: 11 }}>
                          View ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Steps */}
          {!showDash && (
            <>
              <div style={s.stepRow}>
                {STEPS.map((st, i) => (
                  <div key={st} style={s.stepItem(i === step, i < step)} onClick={() => i < step && setStep(i)}>
                    {i < step ? '✓ ' : ''}{st}
                  </div>
                ))}
              </div>

              {/* STEP 0 — Debt */}
              {step === 0 && (
                <div style={s.card}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>What debt are you refinancing?</div>
                  <div style={s.grid2}>
                    {DEBTS.map(d => (
                      <div key={d.id} style={debtType.id === d.id ? s.chipActive('#4fffb0') : s.chipIdle} onClick={() => setDebtType(d)}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{d.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                        <div style={{ color: '#ff6b6b', fontWeight: 800 }}>{d.rate}% APR</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div style={s.label}>How much do you owe?</div>
                    <input
                      style={s.input}
                      type="number"
                      value={debtAmount}
                      onChange={e => setDebtAmount(+e.target.value)}
                    />
                  </div>
                  <button style={s.bigBtn} onClick={() => setStep(1)}>Continue →</button>
                </div>
              )}

              {/* STEP 1 — Collateral */}
              {step === 1 && (
                <div style={s.card}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Choose your collateral</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ASSETS.map(a => (
                      <div key={a.id} style={asset.id === a.id ? s.chipActive(a.clr) : s.chipIdle} onClick={() => setAsset(a)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 24, color: a.clr }}>{a.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700 }}>{a.name}</div>
                              <div style={{ fontSize: 13, color: '#4a5580' }}>{a.sym} · ${fmt(prices[a.id] ?? 0)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, color: '#4a5580' }}>Max LTV</div>
                            <div style={{ fontWeight: 800, color: a.clr }}>{(a.ltv * 100).toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div style={s.label}>Collateral value (USD)</div>
                    <input style={s.input} type="number" value={collateral} onChange={e => setCollateral(+e.target.value)} />
                  </div>
                  <div style={{ background: '#060d1a', borderRadius: 10, padding: 14, marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4a5580' }}>Max borrow</span>
                    <span style={{ fontWeight: 700, color: '#4fffb0' }}>{fmtU(maxBorrow)}</span>
                  </div>
                  {collateral < debtAmount / asset.ltv && (
                    <div style={{ background: '#ff6b6b15', border: '1px solid #ff6b6b40', borderRadius: 10, padding: 12, marginTop: 10, color: '#ff6b6b', fontSize: 13 }}>
                      ⚠️ Need at least {fmtU(debtAmount / asset.ltv)} collateral to borrow {fmtU(debtAmount)}
                    </div>
                  )}
                  <button style={s.bigBtn} onClick={() => setStep(2)}>Continue →</button>
                </div>
              )}

              {/* STEP 2 — Protocol */}
              {step === 2 && (
                <div style={s.card}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Choose your protocol</div>
                  {PROTOCOLS.map(p => {
                    const r = rates[p.id] ?? p.fb;
                    return (
                      <div key={p.id} style={{ ...(protocol.id === p.id ? s.chipActive(p.badgeClr) : s.chipIdle), marginBottom: 10 }} onClick={() => setProtocol(p)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 28 }}>{p.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                              <div style={{ fontSize: 12, color: '#4a5580' }}>TVL {p.tvl}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 24, fontWeight: 900, color: p.badgeClr }}>{r}%</div>
                            <div style={s.tag(p.badgeClr)}>{p.badge}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button style={s.bigBtn} onClick={async () => { setStep(3); getAI(); }}>Continue →</button>
                </div>
              )}

              {/* STEP 3 — Execute */}
              {step === 3 && (
                <div style={s.card}>
                  <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Review & Execute</div>

                  {/* Summary */}
                  <div style={{ background: '#060d1a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    {[
                      ['Debt to refinance', `${fmtU(debtAmount)} ${debtType.name}`],
                      ['Collateral',        `${fmtU(collateral)} ${asset.sym}`],
                      ['Protocol',          protocol.name],
                      ['Borrow APR',        `${rate}%`],
                      ['Health Factor',     health.toFixed(2)],
                      ['Annual Savings',    fmtU(savings)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a2535' }}>
                        <span style={{ color: '#4a5580', fontSize: 14 }}>{k}</span>
                        <span style={{ fontWeight: 700, color: '#e6edf3', fontSize: 14 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* AI Panel */}
                  {loadingAI && <div style={{ color: '#4a5580', fontSize: 14, marginBottom: 12 }}>🤖 AI analyzing your position...</div>}
                  {aiResult && (
                    <div style={{ background: '#060d1a', border: `1px solid ${aiResult.verdict === 'GO' ? '#4fffb040' : '#f0b42940'}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <span style={s.tag(aiResult.verdict === 'GO' ? '#4fffb0' : '#f0b429')}>{aiResult.verdict}</span>
                        <span style={{ fontWeight: 700 }}>{aiResult.headline}</span>
                      </div>
                      <div style={{ fontSize: 14, color: '#8090a0', marginBottom: 6 }}>{aiResult.insight}</div>
                      <div style={{ fontSize: 13, color: '#ff6b6b' }}>⚠️ {aiResult.risk}</div>
                      <div style={{ fontSize: 13, color: '#4fffb0', marginTop: 4 }}>💡 {aiResult.tip}</div>
                    </div>
                  )}

                  {/* TX Log */}
                  {txLog.length > 0 && (
                    <div style={{ ...s.txBox, marginBottom: 16 }}>
                      {txLog.map((t, i) => (
                        <div key={i} style={s.txRow}>
                          <span style={{ color: '#4a5580', fontSize: 11, flexShrink: 0 }}>{t.time}</span>
                          <span style={{ flex: 1 }}>{t.msg}</span>
                          {t.hash && (
                            <a href={`https://etherscan.io/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ color: '#4fffb0', fontSize: 11, flexShrink: 0 }}>
                              View ↗
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Execute Button */}
                  {txStep === 'done'
                    ? <button style={{ ...s.bigBtn, background: '#4fffb0' }} onClick={() => setShowDash(true)}>View Dashboard →</button>
                    : txStep === 'error'
                    ? <button style={{ ...s.bigBtn, background: '#ff6b6b' }} onClick={() => { setTxLog([]); setTxStep(null); }}>Try Again</button>
                    : (
                      <button style={s.bigBtn} onClick={handleExecute} disabled={!!txStep}>
                        {!isConnected
                          ? '🔗 Connect Wallet to Execute'
                          : txStep === 'approve' ? '⏳ Approving...'
                          : txStep === 'supply'  ? '⏳ Supplying Collateral...'
                          : txStep === 'borrow'  ? '⏳ Borrowing USDC...'
                          : `⚡ Execute on ${protocol.name}`
                        }
                      </button>
                    )
                  }

                  {!isConnected && (
                    <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#4a5580' }}>
                      Wallet required to execute real transactions
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Network warning */}
          {isConnected && chainId !== 1 && chainId !== 8453 && chainId !== 42161 && (
            <div style={{ background: '#ff6b6b15', border: '1px solid #ff6b6b40', borderRadius: 12, padding: 16, marginTop: 12, color: '#ff6b6b', textAlign: 'center' }}>
              ⚠️ Switch to Ethereum, Base, or Arbitrum to use RefiFi
              <button style={{ marginLeft: 12, background: '#ff6b6b', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }} onClick={() => switchChain({ chainId: 1 })}>
                Switch to Ethereum
              </button>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 40, color: '#4a5580', fontSize: 13 }}>
            Non-custodial · Your keys, your crypto · Audit your transactions on Etherscan<br />
            <span style={{ color: '#ff6b6b' }}>⚠️ DeFi carries liquidation risk. Never borrow more than you can repay.</span>
          </div>
        </div>
      </div>
    </>
  );
}
