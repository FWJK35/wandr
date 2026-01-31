import { OverlayView } from '@react-google-maps/api';

interface UserMarkerProps {
  position: { lat: number; lng: number };
}

export default function UserMarker({ position }: UserMarkerProps) {
  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div className="relative transform -translate-x-1/2 -translate-y-1/2">
        {/* Accuracy circle / pulse */}
        <div className="absolute inset-0 w-16 h-16 -ml-4 -mt-4">
          <div className="absolute inset-0 bg-primary-500/20 rounded-full animate-ping" />
          <div className="absolute inset-2 bg-primary-500/30 rounded-full animate-pulse" />
        </div>

        {/* User dot */}
        <div className="relative w-8 h-8 rounded-full bg-primary-500 border-4 border-white shadow-lg flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>

        {/* Direction indicator (optional - would need heading data) */}
        {/* <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0
          border-l-4 border-r-4 border-b-8
          border-l-transparent border-r-transparent border-b-primary-500"
        /> */}
      </div>
    </OverlayView>
  );
}
