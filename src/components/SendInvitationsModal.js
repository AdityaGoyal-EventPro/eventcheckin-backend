import React, { useState } from 'react';
import { X, Mail, MessageSquare, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { invitationsAPI } from '../api';

function SendInvitationsModal({ eventId, eventName, guestCount, onClose, onSuccess }) {
  const [sending, setSending] = useState(false);
  const [channels, setChannels] = useState({ email: true, sms: false, whatsapp: false });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!channels.email && !channels.sms && !channels.whatsapp) {
      setError('Please select at least one channel');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await invitationsAPI.sendBulk(eventId, channels);
      setResult(response.data.results);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send invitations');
    } finally {
      setSending(false);
    }
  };

  const toggleChannel = (channel) => {
    setChannels(prev => ({ ...prev, [channel]: !prev[channel] }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Send Invitations</h2>
              <p className="text-sm text-gray-500 mt-1">{eventName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {result ? (
            // Success State
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-scaleIn">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Invitations Sent!</h3>
              <div className="space-y-2 text-sm text-gray-600">
                {result.email && (
                  <p>✉️ Email: {result.email.sent} sent, {result.email.failed} failed</p>
                )}
                {result.sms && (
                  <p>📱 SMS: {result.sms.sent} sent, {result.sms.failed} failed</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Guest Count */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{guestCount}</div>
                  <div className="text-sm text-gray-600">Guests will receive invitations</div>
                </div>
              </div>

              {/* Channel Selection */}
              <div className="space-y-3 mb-6">
                <label className="text-sm font-medium text-gray-700 block mb-3">
                  Select channels:
                </label>

                {/* Email Option */}
                <button
                  onClick={() => toggleChannel('email')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    channels.email
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    channels.email ? 'bg-purple-500' : 'bg-gray-100'
                  }`}>
                    <Mail className={`w-6 h-6 ${channels.email ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">Email</div>
                    <div className="text-sm text-gray-500">Send via email with QR code</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    channels.email ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                  }`}>
                    {channels.email && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                </button>

                {/* SMS Option */}
                <button
                  onClick={() => toggleChannel('sms')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    channels.sms
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    channels.sms ? 'bg-blue-500' : 'bg-gray-100'
                  }`}>
                    <MessageSquare className={`w-6 h-6 ${channels.sms ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">SMS</div>
                    <div className="text-sm text-gray-500">Send text message with QR link</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    channels.sms ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {channels.sms && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Info */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-800">
                  💡 Guests will receive their unique QR codes. They can show these at the entrance for quick check-in.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
            <button
              onClick={onClose}
              disabled={sending}
              className="flex-1 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (!channels.email && !channels.sms && !channels.whatsapp)}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SendInvitationsModal;
