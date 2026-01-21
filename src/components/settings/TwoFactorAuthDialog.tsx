import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Smartphone } from "lucide-react";

interface TwoFactorAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TwoFactorAuthDialog = ({ open, onOpenChange }: TwoFactorAuthDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            Add an extra layer of security to your account.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="flex items-start gap-4 p-4 border rounded-lg bg-muted/50">
            <Smartphone className="h-8 w-8 text-muted-foreground mt-1" />
            <div className="space-y-1">
              <h4 className="font-medium">Coming Soon</h4>
              <p className="text-sm text-muted-foreground">
                Two-factor authentication via authenticator apps will be available soon. 
                This will allow you to add an extra verification step when signing in.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-sm">When available, you'll be able to:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Use apps like Google Authenticator or Authy
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Generate backup codes for account recovery
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Protect your account from unauthorized access
              </li>
            </ul>
          </div>
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
};
