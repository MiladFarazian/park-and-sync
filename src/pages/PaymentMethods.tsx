import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PaymentMethods = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Payment Methods</h1>
            <p className="text-muted-foreground">Cards and billing</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Card
          </Button>
        </div>

        <Card className="p-12 text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No payment methods</h3>
          <p className="text-muted-foreground mb-4">
            Add a payment method to complete bookings
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default PaymentMethods;
