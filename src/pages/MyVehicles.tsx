import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Car, MoreVertical, Pencil, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}

const SwipeableCard = ({ children, onDelete, disabled }: SwipeableCardProps) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || !isMobile) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || disabled || !isMobile) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    // Only allow left swipe (negative values)
    if (diff < 0) {
      setTranslateX(Math.max(diff, -100));
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || disabled) return;
    setIsDragging(false);
    
    // If swiped more than 80px, trigger delete
    if (translateX < -80) {
      setTranslateX(-100);
      // Small delay before triggering delete for visual feedback
      setTimeout(() => {
        onDelete();
        setTranslateX(0);
      }, 200);
    } else {
      setTranslateX(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete background */}
      <div 
        className="absolute inset-y-0 right-0 w-24 bg-destructive flex items-center justify-center rounded-r-xl"
        style={{ opacity: Math.min(Math.abs(translateX) / 80, 1) }}
      >
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </div>
      
      {/* Card content */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative bg-card"
      >
        {children}
      </div>
    </div>
  );
};

const MyVehiclesContent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles", user?.id] });
      toast.success("Vehicle deleted successfully");
      setDeleteDialogOpen(false);
      setVehicleToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete vehicle");
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      // First, unset all vehicles as primary
      const { error: unsetError } = await supabase
        .from("vehicles")
        .update({ is_primary: false })
        .eq("user_id", user?.id);
      
      if (unsetError) throw unsetError;

      // Then set the selected vehicle as primary
      const { error: setError } = await supabase
        .from("vehicles")
        .update({ is_primary: true })
        .eq("id", vehicleId);
      
      if (setError) throw setError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles", user?.id] });
      toast.success("Primary vehicle updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to set primary vehicle");
    },
  });

  const handleDeleteClick = (vehicleId: string) => {
    setVehicleToDelete(vehicleId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (vehicleToDelete) {
      deleteMutation.mutate(vehicleToDelete);
    }
  };

  const handleSetPrimary = (vehicleId: string) => {
    setPrimaryMutation.mutate(vehicleId);
  };

  const renderVehicleCard = (vehicle: any) => {
    const cardContent = (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-muted flex-shrink-0">
            <Car className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-lg truncate">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h3>
                <p className="text-sm text-muted-foreground">{vehicle.license_plate}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {vehicle.is_primary && (
                  <Badge variant="secondary">Primary</Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-background border">
                    {!vehicle.is_primary && (
                      <>
                        <DropdownMenuItem 
                          onClick={() => handleSetPrimary(vehicle.id)}
                          disabled={setPrimaryMutation.isPending}
                        >
                          <Star className="h-4 w-4 mr-2" />
                          Set as Primary
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => navigate(`/edit-vehicle/${vehicle.id}`)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDeleteClick(vehicle.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">{vehicle.size_class}</Badge>
              {vehicle.color && (
                <Badge variant="outline" className="capitalize">{vehicle.color}</Badge>
              )}
              {vehicle.is_ev && (
                <Badge variant="outline">EV</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    );

    if (isMobile) {
      return (
        <SwipeableCard 
          key={vehicle.id} 
          onDelete={() => handleDeleteClick(vehicle.id)}
          disabled={deleteMutation.isPending}
        >
          {cardContent}
        </SwipeableCard>
      );
    }

    return (
      <div key={vehicle.id} className="animate-fade-in">
        {cardContent}
      </div>
    );
  };

  return (
    <div className="bg-background min-h-screen">
      <div className="container max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">My Vehicles</h1>
            <p className="text-sm text-muted-foreground">Manage your registered vehicles</p>
          </div>
          <Button onClick={() => navigate("/add-vehicle")} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>

        {/* Swipe hint for mobile */}
        {isMobile && vehicles && vehicles.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Swipe left on a vehicle to delete
          </p>
        )}

        {/* Vehicle List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Card key={i} className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-2 mt-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="space-y-4">
            {vehicles.map(renderVehicleCard)}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No vehicles yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first vehicle to get started with bookings
            </p>
            <Button onClick={() => navigate("/add-vehicle")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this vehicle? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MyVehicles = () => {
  return (
    <RequireAuth feature="vehicles">
      <MyVehiclesContent />
    </RequireAuth>
  );
};

export default MyVehicles;