const typing = new Map(); // key: roomId or 'private:user1:user2' -> Set of userIds
const timeouts = new Map();

export function startTyping(conversationKey, userId) {
  if (!typing.has(conversationKey)) {
    typing.set(conversationKey, new Set());
  }
  typing.get(conversationKey).add(userId);
  
  // Clear existing timeout
  const timeoutKey = conversationKey + ':' + userId;
  if (timeouts.has(timeoutKey)) {
    clearTimeout(timeouts.get(timeoutKey));
  }
  // Auto-stop after 3 seconds
  const timeout = setTimeout(() => {
    stopTyping(conversationKey, userId);
  }, 3000);
  timeouts.set(timeoutKey, timeout);
}

export function stopTyping(conversationKey, userId) {
  if (typing.has(conversationKey)) {
    typing.get(conversationKey).delete(userId);
    if (typing.get(conversationKey).size === 0) {
      typing.delete(conversationKey);
    }
  }
  const timeoutKey = conversationKey + ':' + userId;
  if (timeouts.has(timeoutKey)) {
    clearTimeout(timeouts.get(timeoutKey));
    timeouts.delete(timeoutKey);
  }
}

export function getTypingUsers(conversationKey, excludeUserId = null) {
  if (!typing.has(conversationKey)) return [];
  const users = Array.from(typing.get(conversationKey));
  if (excludeUserId) {
    return users.filter(u => u !== excludeUserId);
  }
  return users;
}

export function clearAll() {
  for (const timeout of timeouts.values()) {
    clearTimeout(timeout);
  }
  timeouts.clear();
  typing.clear();
}

export default { startTyping, stopTyping, getTypingUsers, clearAll };