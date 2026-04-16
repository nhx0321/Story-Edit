-- Sprite bean value system: add bean balance, spending tracking, and day conversion

ALTER TABLE user_sprites
  ADD COLUMN bean_balance integer DEFAULT 0,
  ADD COLUMN total_bean_spent integer DEFAULT 0,
  ADD COLUMN converted_days integer DEFAULT 0;
