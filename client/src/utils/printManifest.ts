// client/src/utils/printManifest.ts

export const printManifest = (item: any) => {
  const win = window.open('', '_blank');
  if (!win) return;

  // This creates a physical manifest slip for your TCG inventory
  win.document.write(`
    <html>
      <head>
        <title>Manifest - ${item.sku}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: #333; }
          .header { border-bottom: 3px solid black; padding-bottom: 10px; margin-bottom: 20px; }
          .sku { font-size: 28px; font-weight: bold; background: #eee; padding: 5px; }
          .section { margin-top: 25px; }
          .label { font-weight: bold; text-transform: uppercase; font-size: 12px; color: #666; }
          .defect-log { border: 1px dashed #ccc; padding: 15px; margin-top: 20px; }
          ul { padding-left: 20px; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CLERIC TRADING OUTPOST</h1>
          <p>Inventory Manifest Slip | Generated: ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="section">
          <div class="label">Inventory SKU</div>
          <div class="sku">${item.sku}</div>
        </div>

        <div class="section">
          <div class="label">Item Name</div>
          <div style="font-size: 20px;">${item.title}</div>
        </div>

        <div class="section">
          <div class="label">Condition Summary</div>
          <div>${item.condition_summary}</div>
        </div>

        <div class="defect-log">
          <div class="label">AI Defect Log / Inspection Notes</div>
          <ul>
            ${item.photo_defect_log.map((defect: string) => `<li>${defect}</li>`).join('')}
          </ul>
        </div>

        <div class="section" style="margin-top: 60px; border-top: 1px solid #000; pt: 10px;">
          <p><strong>Storage Bin Location:</strong> _________________________</p>
        </div>

        <script>
          // Automatically trigger the print dialog as soon as the window loads
          window.onload = function() { 
            window.print(); 
            // Optional: window.close(); 
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
};