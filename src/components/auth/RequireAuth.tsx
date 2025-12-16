import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, CreditCard, MessageCircle, CalendarCheck, LucideIcon } from "lucide-react";

interface RequireAuthProps {
  children: ReactNode;
  feature?: "vehicles" | "payments" | "booking" | "messages";
}

const featureConfig: Record<string, { icon: LucideIcon; title: string; description: string }> = {
  vehicles: {
    icon: Car,
    title: "Manage Your Vehicles",
    description: "Sign in to add and manage your vehicles for easier booking.",
  },
  payments: {
    icon: CreditCard,
    title: "Payment Methods",
    description: "Sign in to securely save and manage your payment methods.",
  },
  booking: {
    icon: CalendarCheck,
    title: "Book Parking",
    description: "Sign in to reserve parking spots and manage your bookings.",
  },
  messages: {
    icon: MessageCircle,
    title: "Your Messages",
    description: "Sign in to chat with hosts and manage your conversations.",
  },
};

const RequireAuth = ({ children, feature }: RequireAuthProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    const config = feature ? featureConfig[feature] : null;
    const Icon = config?.icon || CalendarCheck;
    const title = config?.title || "Sign In Required";
    const description = config?.description || "Please sign in or create an account to access this feature.";

    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full overflow-hidden">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-primary/90 to-primary p-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 shadow-lg">
              <Icon className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
          </div>
          
          {/* Content */}
          <div className="p-6 text-center space-y-6">
            <p className="text-muted-foreground text-lg">
              {description}
            </p>
            
            <div className="space-y-3">
              <Button 
                onClick={() => navigate("/auth")} 
                className="w-full"
                size="lg"
              >
                Sign up / Log in
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => navigate(-1)} 
                className="w-full text-muted-foreground"
              >
                Go back
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAuth;
