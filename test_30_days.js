function test() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const formattedDate = Utilities.formatDate(thirtyDaysAgo, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  console.log(formattedDate);
}
