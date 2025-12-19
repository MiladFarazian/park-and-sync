import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vehicleMakes, vehicleModels, vehicleColors } from "@/lib/vehicleData";
import { useQuery } from "@tanstack/react-query";
import RequireAuth from "@/components/auth/RequireAuth";

const EditVehicleContent = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    license_plate: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    size_class: "compact" as "compact" | "midsize" | "suv" | "truck",
    is_ev: false,
    is_primary: false,
  });

  // Fetch existing vehicle data
  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Populate form when vehicle data is loaded
  useEffect(() => {
    if (vehicle) {
      setFormData({
        license_plate: vehicle.license_plate || "",
        make: vehicle.make || "",
        model: vehicle.model || "",
        year: vehicle.year || new Date().getFullYear(),
        color: vehicle.color || "",
        size_class: vehicle.size_class || "compact",
        is_ev: vehicle.is_ev || false,
        is_primary: vehicle.is_primary || false,
      });
    }
  }, [vehicle]);

  // Filter models based on selected make
  const availableModels = useMemo(() => {
    if (!formData.make) return [];
    return vehicleModels[formData.make] || [];
  }, [formData.make]);

  // Reset model when make changes
  const handleMakeChange = (make: string) => {
    setFormData({ ...formData, make, model: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !id) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success("Vehicle updated successfully");
      navigate("/my-vehicles");
    } catch (error: any) {
      toast.error(error.message || "Failed to update vehicle");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-24">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/my-vehicles')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Card className="p-6 space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-24">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/my-vehicles')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Vehicle</h1>
            <p className="text-sm text-muted-foreground">Update your vehicle details</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate *</Label>
                <Input
                  id="license_plate"
                  required
                  value={formData.license_plate}
                  onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Combobox
                    options={vehicleMakes}
                    value={formData.make}
                    onChange={handleMakeChange}
                    placeholder="Select make"
                    searchPlaceholder="Search makes..."
                    emptyText="No make found."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Combobox
                    options={availableModels}
                    value={formData.model}
                    onChange={(model) => setFormData({ ...formData, model })}
                    placeholder="Select model"
                    searchPlaceholder="Search models..."
                    emptyText={formData.make ? "No model found." : "Select a make first"}
                    disabled={!formData.make}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    min="1900"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Combobox
                    options={vehicleColors}
                    value={formData.color}
                    onChange={(color) => setFormData({ ...formData, color })}
                    placeholder="Select color"
                    searchPlaceholder="Search colors..."
                    emptyText="No color found."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="size_class">Size Class *</Label>
                <Select
                  value={formData.size_class}
                  onValueChange={(value: any) => setFormData({ ...formData, size_class: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="midsize">Midsize</SelectItem>
                    <SelectItem value="suv">SUV</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="is_ev">Electric Vehicle</Label>
                  <p className="text-sm text-muted-foreground">Is this an EV?</p>
                </div>
                <Switch
                  id="is_ev"
                  checked={formData.is_ev}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_ev: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="is_primary">Primary Vehicle</Label>
                  <p className="text-sm text-muted-foreground">Use as default for bookings</p>
                </div>
                <Switch
                  id="is_primary"
                  checked={formData.is_primary}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/my-vehicles')}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
};

const EditVehicle = () => {
  return (
    <RequireAuth feature="vehicles">
      <EditVehicleContent />
    </RequireAuth>
  );
};

export default EditVehicle;