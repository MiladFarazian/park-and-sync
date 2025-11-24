import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const MyVehicles = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  return (
    <div className="bg-background">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">My Vehicles</h1>
            <p className="text-muted-foreground">Manage your cars</p>
          </div>
          <Button onClick={() => navigate("/add-vehicle")}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vehicle
          </Button>
        </div>

        {isLoading ? (
          <Card className="p-6">
            <p className="text-center text-muted-foreground">Loading vehicles...</p>
          </Card>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="space-y-4">
            {vehicles.map((vehicle) => (
              <Card key={vehicle.id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-muted">
                    <Car className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </h3>
                        <p className="text-muted-foreground">{vehicle.license_plate}</p>
                      </div>
                      {vehicle.is_primary && (
                        <Badge variant="secondary">Primary</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{vehicle.size_class}</Badge>
                      {vehicle.color && (
                        <Badge variant="outline">{vehicle.color}</Badge>
                      )}
                      {vehicle.is_ev && (
                        <Badge variant="outline">EV</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No vehicles yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first vehicle to get started with bookings
            </p>
            <Button onClick={() => navigate("/add-vehicle")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MyVehicles;
