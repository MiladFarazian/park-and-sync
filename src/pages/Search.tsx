import React from 'react';
import { MapPin, Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const Search = () => {
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Find Parking</h1>
        <p className="text-muted-foreground">Search for available spots near you</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input 
          placeholder="Where do you need parking?" 
          className="pl-10 h-12"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 justify-start">
          <MapPin className="h-4 w-4 mr-2" />
          Current Location
        </Button>
        <Button variant="outline" className="h-12 justify-start">
          <SearchIcon className="h-4 w-4 mr-2" />
          Search Area
        </Button>
      </div>

      {/* Recent Searches */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Searches</h2>
        <div className="space-y-2">
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">Downtown Area</p>
                <p className="text-sm text-muted-foreground">123 Main St</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">Business District</p>
                <p className="text-sm text-muted-foreground">789 Business Blvd</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Search;