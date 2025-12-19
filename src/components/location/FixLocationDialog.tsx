import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Shield,
  Clock,
  Wifi,
  BatteryLow,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Smartphone,
} from 'lucide-react';

interface FixLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorCode: number | null; // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  onRetry: () => void;
  onSuccess?: (coords: { lat: number; lng: number }) => void;
}

const FixLocationDialog = ({
  open,
  onOpenChange,
  errorCode,
  onRetry,
  onSuccess,
}: FixLocationDialogProps) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<'success' | 'failed' | null>(null);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryResult(null);

    if (!navigator.geolocation) {
      setRetryResult('failed');
      setIsRetrying(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setRetryResult('success');
        setIsRetrying(false);
        localStorage.setItem(
          'parkzy:lastLocation',
          JSON.stringify({ ...coords, ts: Date.now() })
        );
        setTimeout(() => {
          onSuccess?.(coords);
          onOpenChange(false);
          onRetry();
        }, 1000);
      },
      () => {
        setRetryResult('failed');
        setIsRetrying(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  };

  const getErrorInfo = () => {
    switch (errorCode) {
      case 1: // PERMISSION_DENIED
        return {
          title: 'Location Permission Denied',
          icon: Shield,
          iconColor: 'text-red-500',
          description:
            'Parkzy needs permission to access your location to find parking spots near you.',
          steps: [
            {
              icon: Smartphone,
              title: 'Open your device Settings',
              description: 'Go to Settings on your phone',
            },
            {
              icon: MapPin,
              title: 'Find Location/Privacy settings',
              description:
                'On iPhone: Privacy & Security → Location Services. On Android: Location',
            },
            {
              icon: Shield,
              title: 'Enable location for your browser',
              description:
                'Find Safari/Chrome and set to "While Using" or "Allow"',
            },
            {
              icon: RefreshCw,
              title: 'Return here and tap Retry',
              description: 'Once enabled, come back and try again',
            },
          ],
        };
      case 2: // POSITION_UNAVAILABLE
        return {
          title: 'Location Unavailable',
          icon: Wifi,
          iconColor: 'text-orange-500',
          description:
            "Your device couldn't determine your location. This can happen indoors or in areas with poor signal.",
          steps: [
            {
              icon: Wifi,
              title: 'Check your connection',
              description: 'Make sure WiFi or cellular data is enabled',
            },
            {
              icon: MapPin,
              title: 'Enable Precise Location',
              description:
                'On iPhone: Settings → Privacy → Location Services → [Browser] → Precise Location ON',
            },
            {
              icon: Smartphone,
              title: 'Try moving outdoors',
              description:
                'GPS works better with a clear view of the sky',
            },
            {
              icon: RefreshCw,
              title: 'Tap Retry below',
              description: 'Try getting your location again',
            },
          ],
        };
      case 3: // TIMEOUT
        return {
          title: 'Location Request Timed Out',
          icon: Clock,
          iconColor: 'text-yellow-500',
          description:
            'Getting your location took too long. This often happens with weak GPS signal.',
          steps: [
            {
              icon: BatteryLow,
              title: 'Disable Low Power Mode',
              description:
                'Low Power Mode can limit GPS accuracy. Turn it off in Settings → Battery',
            },
            {
              icon: MapPin,
              title: 'Enable Precise Location',
              description:
                'Settings → Privacy → Location Services → [Browser] → Precise Location ON',
            },
            {
              icon: Smartphone,
              title: 'Move to a better spot',
              description:
                'Step outside or near a window for better GPS signal',
            },
            {
              icon: RefreshCw,
              title: 'Wait a moment, then Retry',
              description:
                'Give your GPS a few seconds to warm up, then try again',
            },
          ],
        };
      default:
        return {
          title: 'Location Issue',
          icon: MapPin,
          iconColor: 'text-muted-foreground',
          description:
            "We're having trouble getting your location. Try the steps below.",
          steps: [
            {
              icon: Shield,
              title: 'Check location permissions',
              description: 'Make sure location is allowed for this app/browser',
            },
            {
              icon: Wifi,
              title: 'Check your connection',
              description: 'Ensure WiFi or cellular data is on',
            },
            {
              icon: RefreshCw,
              title: 'Tap Retry below',
              description: 'Try getting your location again',
            },
          ],
        };
    }
  };

  const errorInfo = getErrorInfo();
  const ErrorIcon = errorInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center space-y-3">
          <div
            className={`mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center ${errorInfo.iconColor}`}
          >
            <ErrorIcon className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">{errorInfo.title}</DialogTitle>
          <DialogDescription className="text-sm">
            {errorInfo.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            How to fix
          </p>
          <div className="space-y-3">
            {errorInfo.steps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={index}
                  className="flex gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retry Result Feedback */}
        {retryResult && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
              retryResult === 'success'
                ? 'bg-green-500/10 text-green-600'
                : 'bg-red-500/10 text-red-600'
            }`}
          >
            {retryResult === 'success' ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">
                  Location found! Redirecting...
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5" />
                <span className="text-sm font-medium">
                  Still couldn't get location. Please check the steps above.
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Location
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FixLocationDialog;
