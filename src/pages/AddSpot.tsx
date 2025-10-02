import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building, MapPin, DollarSign } from 'lucide-react';

const AddSpot = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement spot creation logic
    console.log('Creating new spot...');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">List Your Parking Spot</h1>
          <p className="text-sm text-muted-foreground">Earn money by sharing your parking space</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Spot Title</Label>
              <Input 
                id="title" 
                placeholder="e.g., Covered Garage in Downtown"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="address" 
                  className="pl-10"
                  placeholder="123 Main St, Los Angeles, CA"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description"
                placeholder="Describe your parking spot, access instructions, etc."
                rows={4}
              />
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pricing
            </h3>

            <div className="space-y-2">
              <Label htmlFor="hourly-rate">Hourly Rate ($)</Label>
              <Input 
                id="hourly-rate" 
                type="number"
                step="0.01"
                min="0"
                placeholder="5.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-rate">Daily Rate (Optional) ($)</Label>
              <Input 
                id="daily-rate" 
                type="number"
                step="0.01"
                min="0"
                placeholder="30.00"
              />
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Building className="h-4 w-4" />
              Features
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="covered" className="rounded" />
                <Label htmlFor="covered" className="font-normal">Covered parking</Label>
              </div>
              
              <div className="flex items-center gap-2">
                <input type="checkbox" id="secure" className="rounded" />
                <Label htmlFor="secure" className="font-normal">Secure/Gated</Label>
              </div>
              
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ev" className="rounded" />
                <Label htmlFor="ev" className="font-normal">EV Charging available</Label>
              </div>
            </div>
          </Card>

          <Button type="submit" className="w-full" size="lg">
            Submit for Review
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AddSpot;
