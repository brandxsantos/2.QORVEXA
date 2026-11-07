function notificationToastText(type) {
  const messages = {
    friend_request: 'You received a friend request.',
    friend_request_accepted: 'A friend request was accepted.',
    message: 'You received a new message.',
    post_like: 'Someone reacted to your post.',
    comment: 'Someone commented on your post.',
    reply: 'Someone replied to your comment.',
  }
  return messages[type] || 'You have a new social notification.'
}

export default notificationToastText
