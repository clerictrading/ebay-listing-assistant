// client/src/App.tsx
import React, { useState, useEffect } from 'react';
import { printManifest } from './utils/printManifest';

// Inside your React component where you display an item:
function ItemRow({ item }) {
  return (
    <div className="flex justify-between p-4 bg-slate-900 mb-2 rounded">
      <div>
        <p className="text-blue-400 font-mono">{item.sku}</p>
        <p className="font-bold">{item.title}</p>
      </div>
      
      <div className="flex items-center gap-4">
        {/* HERE IS THE BUTTON */}
        <button 
          onClick={() => printManifest(item)}
          className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-xs"
        >
          Print Manifest
        </button>

        <a 
          href={`https://www.ebay.com/sh/lst/active`} 
          className="text-blue-500 hover:underline text-xs"
        >
          View on eBay
        </a>
      </div>
    </div>
  );
}

const Dashboard = () => {
  const [logs, setLogs] = useState([{ time: '21:40', msg: 'Worker polling inbox...' }]);
  const [items, setItems] = useState([
    { sku: 'CLERIC-1720384', title: 'Charizard Base Set Holo', price: 450.00, status: 'Draft' }
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="flex justify-between items-center border-b border-slate-800 pb-6 mb-8">
        <h1 className="text-2xl font-bold tracking-tighter text-blue-400">CLERIC TRADING OUTPOST <span className="text-slate-500 font-light">Listing Dashboard</span></h1>
        <div className="flex gap-4">
          <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-bold transition">Manual Sync</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Activity Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-64 overflow-y-auto">
          <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-4">System Activity</h2>
          {logs.map((log, i) => (
            <div key={i} className="text-sm mb-2 font-mono">
              <span className="text-slate-600">[{log.time}]</span> {log.msg}
            </div>
          ))}
        </div>

        {/* History Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-4">SKU</th>
                <th className="p-4">Title</th>
                <th className="p-4">Appraisal</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item) => (
                <tr key={item.sku} className="hover:bg-slate-800/50 transition">
                  <td className="p-4 font-mono text-blue-300">{item.sku}</td>
                  <td className="p-4">{item.title}</td>
                  <td className="p-4 font-bold">${item.price}</td>
                  <td className="p-4">
                    <a href={`https://www.ebay.com/sh/lst/active`} target="_blank" className="text-xs bg-slate-700 px-3 py-1 rounded hover:bg-slate-600">Open in Hub</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;