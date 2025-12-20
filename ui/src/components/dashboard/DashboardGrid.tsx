import { useCallback } from 'react';
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
  width?: number;
}

export function DashboardGrid({
  children,
  layouts,
  editMode,
  onLayoutChange,
  width = 1200,
}: DashboardGridProps) {
  // Convert our PanelLayout to react-grid-layout's Layout format
  const gridLayout: Layout = layouts.map((l) => ({
    i: l.id,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    minW: 2,
    minH: 2,
    maxW: 12,
  }));

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const panelLayouts: PanelLayout[] = newLayout.map((l) => ({
        id: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
      }));
      onLayoutChange(panelLayouts);
    },
    [onLayoutChange]
  );

  return (
    <GridLayout
      className="dashboard-grid"
      layout={gridLayout}
      width={width}
      gridConfig={{
        cols: 12,
        rowHeight: 80,
        margin: [16, 16],
        containerPadding: [0, 0],
      }}
      dragConfig={{
        enabled: editMode,
        handle: '.panel-drag-handle',
      }}
      resizeConfig={{
        enabled: editMode,
      }}
      onLayoutChange={handleLayoutChange}
    >
      {children}
    </GridLayout>
  );
}

export default DashboardGrid;
