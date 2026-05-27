import React, { useState, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  tool?: string;
  data?: unknown;
  timestamp: Date;
}

interface ChatResponse {
  ok: boolean;
  message: string;
  tool?: string;
  toolInput?: unknown;
  data?: {
    rows?: Array<Record<string, unknown>>;
    series?: Array<{ x: number; y: number }>;
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

const ChatWidget: React.FC<{ sidecarUrl?: string }> = ({ sidecarUrl = 'http://localhost:8787' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Welcome message
    const welcomeId = Math.random().toString(36).slice(2);
    setMessages([
      {
        id: welcomeId,
        role: 'assistant',
        content: 'Hi! I can help you explore DisCanVis2 data. Try asking about:\n• Disease trends for specific proteins or genes\n• Mutation records (search by gene or protein)\n• ClinVar records and their pathogenic significance',
        timestamp: new Date(),
      },
    ]);

    // Check connection
    fetch(`${sidecarUrl}/health`)
      .then(r => r.ok && setConnected(true))
      .catch(() => setConnected(false));
  }, [sidecarUrl]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const userMessage = inputValue.trim();
    if (!userMessage) return;

    // Add user message
    const userMsgId = Math.random().toString(36).slice(2);
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }]);

    setInputValue('');
    setLoading(true);

    try {
      const response = await fetch(`${sidecarUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const result: ChatResponse = await response.json();

      if (!result.ok) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          role: 'error',
          content: `Error: ${result.message || 'Unknown error'}`,
          timestamp: new Date(),
        }]);
      } else {
        let displayText = '';

        if (result.tool === 'get_disease_trend') {
          const series = result.data?.series || [];
          displayText = `Found ${series.length} data points across the query range.`;
        } else if (result.tool === 'get_mutation_browse_table') {
          const total = result.data?.total || 0;
          displayText = `Found ${total} mutation records.`;
        } else if (result.tool === 'get_clinvar_browse_table') {
          const total = result.data?.total || 0;
          displayText = `Found ${total} ClinVar records.`;
        } else {
          displayText = 'Query processed successfully.';
        }

        setMessages(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: displayText,
          tool: result.tool,
          data: result.data,
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        role: 'error',
        content: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMake sure the sidecar server is running at ${sidecarUrl}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-4">
      <div className="max-w-2xl w-full mx-auto flex flex-col h-full bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 text-white p-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">DisCanVis2 Query Assistant</h1>
          <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : msg.role === 'error'
                    ? 'bg-red-100 text-red-700 rounded-bl-none'
                    : 'bg-gray-200 text-gray-900 rounded-bl-none'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.tool && (
                  <p className="text-xs mt-2 opacity-70 italic">Tool: {msg.tool}</p>
                )}
                {msg.data && msg.data.rows && (
                  <div className="mt-2 max-h-48 overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="border-b">
                          {Object.keys(msg.data.rows[0] || {}).slice(0, 4).map(key => (
                            <th key={key} className="px-2 py-1 text-left font-semibold truncate">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.rows.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className="border-b">
                            {Object.values(row).slice(0, 4).map((val, i) => (
                              <td key={i} className="px-2 py-1 truncate">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {msg.data.total && (
                      <p className="text-xs mt-1 opacity-70">
                        Showing {msg.data.rows.length} of {msg.data.total} results
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg rounded-bl-none">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" />
                  <span className="text-sm">Processing...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="border-t p-4 bg-white flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Ask about genes, mutations, pathogenicity..."
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-medium"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWidget;
