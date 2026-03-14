import User from '../models/User.js';

export async function getUserByUsername(username) {
  return User.findOne({ username });
}

export async function getUserByEmail(email) {
  return User.findOne({ email });
}

export async function insertUser(userData) {
  const user = new User(userData);
  return user.save();
}