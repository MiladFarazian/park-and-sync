import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vehicleMakes, vehicleModels, vehicleColors } from "@/lib/vehicleData";

const AddVehicle = () => {
  const navigate = useNavigate();
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
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("vehicles").insert([{
        user_id: user.id,
        ...formData,
      }]);

      if (error) throw error;

      toast.success("Vehicle added successfully");
      navigate("/my-vehicles");
    } catch (error: any) {
      toast.error(error.message || "Failed to add vehicle");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-24">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/my-vehicles')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Add Vehicle</h1>
            <p className="text-muted-foreground">Register a new vehicle</p>
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
                {isSubmitting ? "Adding..." : "Add Vehicle"}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
};

export default AddVehicle;
