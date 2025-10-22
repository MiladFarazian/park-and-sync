import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Search, Send } from 'lucide-react';

interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

const Messages = () => {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data
  const conversations: Conversation[] = [
    {
      id: '1',
      name: 'John Doe',
      lastMessage: 'Is the parking spot still available?',
      timestamp: '2m ago',
      unread: true
    },
    {
      id: '2',
      name: 'Jane Smith',
      lastMessage: 'Thanks for the confirmation!',
      timestamp: '1h ago',
      unread: false
    },
    {
      id: '3',
      name: 'Mike Johnson',
      lastMessage: 'What time can I check in?',
      timestamp: '3h ago',
      unread: true
    }
  ];

  const messages: Message[] = selectedConversation ? [
    {
      id: '1',
      senderId: selectedConversation,
      text: 'Hi! Is the parking spot still available for this weekend?',
      timestamp: '10:30 AM'
    },
    {
      id: '2',
      senderId: 'me',
      text: 'Yes, it is! Would you like to book it?',
      timestamp: '10:32 AM'
    },
    {
      id: '3',
      senderId: selectedConversation,
      text: 'Is the parking spot still available?',
      timestamp: '10:35 AM'
    }
  ] : [];

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      // Handle send message
      setMessageInput('');
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversations List */}
      <Card className="w-full md:w-80 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-2xl font-bold mb-4">Messages</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors hover:bg-accent ${
                  selectedConversation === conversation.id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar>
                    <AvatarImage src={conversation.avatar} />
                    <AvatarFallback>{conversation.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm truncate">{conversation.name}</p>
                      <span className="text-xs text-muted-foreground">{conversation.timestamp}</span>
                    </div>
                    <p className={`text-sm truncate ${conversation.unread ? 'font-medium' : 'text-muted-foreground'}`}>
                      {conversation.lastMessage}
                    </p>
                  </div>
                  {conversation.unread && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Messages Area */}
      <Card className="hidden md:flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>
                    {conversations.find(c => c.id === selectedConversation)?.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{conversations.find(c => c.id === selectedConversation)?.name}</p>
                  <p className="text-sm text-muted-foreground">Active now</p>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === 'me' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        message.senderId === 'me'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <p className={`text-xs mt-1 ${
                        message.senderId === 'me' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {message.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <Button onClick={handleSendMessage} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Messages;
