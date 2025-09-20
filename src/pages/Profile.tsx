import React from 'react';
import { Settings, Edit, Star, User, Car, CreditCard, Bell, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const Profile = () => {
  const profileStats = [
    { label: 'Total Trips', value: '47' },
    { label: 'Rating', value: '4.8' },
    { label: 'Reviews', value: '28' }
  ];

  const settingsItems = [
    { 
      icon: User, 
      label: 'Personal Information', 
      subtitle: 'Update your profile details',
      action: 'navigate'
    },
    { 
      icon: Car, 
      label: 'My Vehicles', 
      subtitle: 'Manage your cars',
      action: 'navigate'
    },
    { 
      icon: CreditCard, 
      label: 'Payment Methods', 
      subtitle: 'Cards and billing',
      action: 'navigate'
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      subtitle: 'Manage your preferences',
      action: 'navigate'
    },
    { 
      icon: Shield, 
      label: 'Privacy & Security', 
      subtitle: 'Account security settings',
      action: 'navigate'
    }
  ];

  const quickSettings = [
    {
      label: 'Booking Updates',
      subtitle: 'Get notified about bookings',
      enabled: true
    },
    {
      label: 'Host Messages',
      subtitle: 'Messages from hosts',
      enabled: true
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header with gradient background */}
      <div className="bg-gradient-primary text-primary-foreground p-6 rounded-b-2xl">
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl font-bold">Profile</h1>
          <Button variant="secondary" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Profile Info */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src="/placeholder.svg" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 bg-background rounded-full p-1">
              <Edit className="h-3 w-3" />
            </div>
          </div>
          
          <div className="flex-1">
            <h2 className="text-xl font-bold">John Doe</h2>
            <p className="text-primary-foreground/80">Member since March 2022</p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">4.8</span>
              <span className="text-primary-foreground/80">(28 reviews)</span>
            </div>
          </div>
          
          <Button variant="secondary" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {profileStats.map((stat, index) => (
            <Card key={index} className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* Quick Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Quick Settings</h3>
          
          {quickSettings.map((setting, index) => (
            <Card key={index} className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{setting.label}</p>
                  <p className="text-sm text-muted-foreground">{setting.subtitle}</p>
                </div>
                <Switch checked={setting.enabled} />
              </div>
            </Card>
          ))}
        </div>

        {/* Settings Menu */}
        <div className="space-y-3">
          {settingsItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Card key={index} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Profile;