#!/usr/bin/env python3
"""
Crypto Proxy Exit Monitor (Meridian Protocol)
Audits live prices for BMNR, ASST, MSTR, and DAGB against the 5-Rung Exit Matrix.
"""

import sys

TARGETS = {
    'BMNR': {
        'name': 'BitMine Immersion Technologies',
        'currency': 'USD',
        'wrapper': 'SIPP',
        'rungs': [
            {'rung': 1, 'name': 'Free Roll (+100%)', 'price': 34.20, 'action': 'Sell 1,000 shares (Sweep to SIPP VWRP)'},
            {'rung': 2, 'name': 'Bull Harvest (+200%)', 'price': 51.30, 'action': 'Sell 400 shares (Sweep to SIPP VWRP)'},
            {'rung': 3, 'name': 'Mania Rung 1 (+350%)', 'price': 77.00, 'action': 'Sell 350 shares (Sweep to SIPP VWRP)'},
            {'rung': 4, 'name': 'Mania Rung 2 (+550%)', 'price': 111.00, 'action': 'Sell 350 shares (Sweep to SIPP VWRP)'},
            {'rung': 5, 'name': 'Permanent Moat', 'price': None, 'action': 'Retain 257 shares permanently in SIPP'}
        ]
    },
    'ASST': {
        'name': 'Strive, Inc.',
        'currency': 'USD',
        'wrapper': 'ISA & SIPP',
        'rungs': [
            {'rung': 1, 'name': 'Free Roll (+100%)', 'price': 52.00, 'action': 'Sell 250 ISA shares (£9.7k Cash) + 80 SIPP shares'},
            {'rung': 2, 'name': 'Mid-Cycle (+250%)', 'price': 91.00, 'action': 'Sell 175 ISA shares (£11.9k Cash) + 50 SIPP shares'},
            {'rung': 3, 'name': 'Farhad Target 1 (+400%)', 'price': 130.00, 'action': 'Sell 125 ISA shares (£12.1k Cash) + 40 SIPP shares'},
            {'rung': 4, 'name': 'Farhad Target 2 (+700%)', 'price': 208.00, 'action': 'Sell 101 ISA shares (ISA 100% EXITED) + 30 SIPP shares'},
            {'rung': 5, 'name': 'Permanent SIPP Moat', 'price': None, 'action': 'Retain 79 shares permanently in SIPP'}
        ]
    },
    'MSTR': {
        'name': 'Strategy Inc.',
        'currency': 'USD',
        'wrapper': 'SIPP',
        'rungs': [
            {'rung': 1, 'name': 'Core Trim (+75%)', 'price': 198.00, 'action': 'Sell 110 shares (Sweep to SIPP VWRP)'},
            {'rung': 2, 'name': 'Cycle Target (+150%)', 'price': 283.00, 'action': 'Sell 120 shares (Sweep to SIPP VWRP)'},
            {'rung': 3, 'name': 'Mania Rung 1 (+250%)', 'price': 396.00, 'action': 'Sell 100 shares (Sweep to SIPP VWRP)'},
            {'rung': 4, 'name': 'Supercycle (+400%)', 'price': 566.00, 'action': 'Sell 80 shares (Sweep to SIPP VWRP)'},
            {'rung': 5, 'name': 'Permanent Moat', 'price': None, 'action': 'Retain 182 shares permanently in SIPP'}
        ]
    },
    'DAGB': {
        'name': 'VanEck Crypto ETF',
        'currency': 'GBP',
        'wrapper': 'SIPP',
        'rungs': [
            {'rung': 1, 'name': 'First Trim (+50%)', 'price': 13.60, 'action': 'Sell 1,000 shares (Sweep to SIPP VWRP)'},
            {'rung': 2, 'name': 'Bull Acceleration (+100%)', 'price': 18.15, 'action': 'Sell 1,000 shares (Sweep to SIPP VWRP)'},
            {'rung': 3, 'name': 'Mania Rung 1 (+175%)', 'price': 25.00, 'action': 'Sell 700 shares (Sweep to SIPP VWRP)'},
            {'rung': 4, 'name': 'Mania Rung 2 (+280%)', 'price': 35.00, 'action': 'Sell 620 shares (Sweep to SIPP VWRP)'},
            {'rung': 5, 'name': 'Permanent Moat', 'price': None, 'action': 'Retain 500 shares permanently in SIPP'}
        ]
    }
}

def evaluate_prices(prices):
    lines = []
    lines.append("# Meridian Crypto Proxy Exit Monitor Audit")
    lines.append("")
    lines.append("| Asset | Wrapper | Current Price | Next Trigger Rung | Target Price | Distance to Target | Action Status |")
    lines.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    
    triggers_hit = []
    
    for ticker, info in TARGETS.items():
        curr = prices.get(ticker)
        curr_str = f"{curr:.2f} {info['currency']}" if curr else "N/A"
        
        next_rung = None
        for r in info['rungs']:
            if r['price'] and curr and curr < r['price']:
                next_rung = r
                break
            elif r['price'] and curr and curr >= r['price']:
                triggers_hit.append((ticker, r, curr))
                
        if next_rung and curr:
            dist = ((next_rung['price'] - curr) / curr) * 100
            dist_str = f"+{dist:.1f}%"
            status = "Approaching" if dist < 5.0 else "Holding / In Range"
            lines.append(f"| **{ticker}** | {info['wrapper']} | {curr_str} | {next_rung['name']} | {next_rung['price']:.2f} {info['currency']} | {dist_str} | {status} |")
        elif not next_rung:
            lines.append(f"| **{ticker}** | {info['wrapper']} | {curr_str} | All Rungs Hit | — | — | Fully De-risked |")
            
    print("\n".join(lines))
    
    if triggers_hit:
        print("\n### ⚠️ ACTION REQUIRED: TRIGGERS BREACHED")
        for t, r, p in triggers_hit:
            print(f"* **{t}** reached {p:.2f} (Target: {r['price']:.2f}) ──▶ **ACTION:** {r['action']}")
    else:
        print("\n✅ **STATUS:** All assets currently within accumulation/holding boundaries. Stand down.")

if __name__ == '__main__':
    sample_prices = {'BMNR': 26.65, 'ASST': 26.75, 'MSTR': 133.50, 'DAGB': 10.15}
    evaluate_prices(sample_prices)
