export function calculateAge(birthDate: Date, at: Date = new Date()): number {
  let age = at.getFullYear() - birthDate.getFullYear();
  const hadBirthdayThisYear =
    at.getMonth() > birthDate.getMonth() ||
    (at.getMonth() === birthDate.getMonth() && at.getDate() >= birthDate.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}
