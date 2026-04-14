const fs = require('fs');

let content = fs.readFileSync('src/pages/MinhasAulas.tsx', 'utf8');

// Update getLessonStatus to include homework status as well
content = content.replace(
  /const getLessonStatus = \(title: string\) => {[^}]*};/,
  `const getLessonStatus = (title: string) => {
    const found = lessons.find((l: any) => l.title?.toLowerCase() === title.toLowerCase());
    return found ? found.status : "pending";
  };`
);

// We need a Flashcard component in the file 
// And Zoom/Material links

