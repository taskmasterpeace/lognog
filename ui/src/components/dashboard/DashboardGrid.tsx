import { useCallback, useEffect, useRef, useState } from 'react';
import { GridLayout, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export interface PanelLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardGridProps {
  children: React.ReactNode;
  layouts: PanelLayout[];
  editMode: boolean;
  onLayoutChange: (layouts: PanelLayout[]) => void;
  /** Fixed width override; by default the grid measures its container. */
  width?: number;
}

export function DashboardGrid({
  children,
  layouts,
  editMode,
  onLayoutChange,
  width,
}: DashboardGridProps) {
  // The grid was hard-coded to 1200px: dead space on wide screens and a
  // horizontal scrollbar on anything narrower. Measure the container instead.
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number>(width ?? 1200);

  useEffect(() => {
    if (width !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setMeasured(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  // Below ~820px (iPad portrait and phones) a 12-column grid leaves half-width
  // panels squished with dead space beside them. Collapse to a single full-width
  // column, stacked in reading order. This is a view-only transform — it is not
  // persisted, so the desktop layout is preserved.
  const effectiveWidth = width ?? measured;
  const narrow = effectiveWidth < 820;
  const cols = narrow ? 1 : 12;

  const gridLayout: Layout = (() => {
    if (!narrow) {
      return layouts.map((l) => ({ i: l.id, x: l.x, y: l.y, w: l.w, h: l.h, minW: 2, minH: 2, maxW: 12 }));
    }
    const ordered = [...layouts].sort((a, b) => a.y - b.y || a.x - b.x);
    let cy = 0;
    return ordered.map((l) => {
      const item = { i: l.id, x: 0, y: cy, w: 1, h: l.h, minW: 1, minH: 2, maxW: 1 };
      cy += l.h;
      return item;
    });
  })();

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // Never save the collapsed single-column layout over the real one.
      if (narrow) return;
      const panelLayouts: PanelLayout[] = newLayout.map((l) => ({
        id: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
      }));
      onLayoutChange(panelLayouts);
    },
    [onLayoutChange, narrow]
  );

  return (
    <div ref={containerRef} className="w-full">
      <GridLayout
        className="dashboard-grid"
        layout={gridLayout}
        width={width ?? measured}
        gridConfig={{
          cols,
          rowHeight: 80,
          margin: [16, 16],
          containerPadding: [0, 0],
        }}
        dragConfig={{
          enabled: editMode && !narrow,
          handle: '.panel-drag-handle',
        }}
        resizeConfig={{
          enabled: editMode && !narrow,
        }}
        onLayoutChange={handleLayoutChange}
      >
        {children}
      </GridLayout>
    </div>
  );
}

export default DashboardGrid;
