const fs = require('fs');
const files = ['login.html', 'fleet.html', 'superadmin.html', 'technicien.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // 1. Variabilisation CSS
    content = content.replace(/--primary:\s*#([0-9a-fA-F]+);/g, '--primary: #3b82f6;');
    content = content.replace(/--secondary:\s*#([0-9a-fA-F]+);/g, '--secondary: #6366f1;');
    content = content.replace(/--bg-dark:\s*#([0-9a-fA-F]+);/g, '--bg-dark: #f8fafc;');
    content = content.replace(/--bg-card:\s*#([0-9a-fA-F]+);/g, '--bg-card: #ffffff;');
    content = content.replace(/--text-primary:\s*#([0-9a-fA-F]+);/g, '--text-primary: #0f172a;');
    content = content.replace(/--text-secondary:\s*#([0-9a-fA-F]+);/g, '--text-secondary: #475569;');
    content = content.replace(/--text-dim:\s*#([0-9a-fA-F]+);/g, '--text-dim: #64748b;');

    // 2. Gradients de fond (Global body)
    content = content.replace(/background:\s*linear-gradient\(135deg,\s*#[0-9A-Fa-f]+\s*\d+%,\s*#[0-9A-Fa-f]+\s*\d+%,\s*#[0-9A-Fa-f]+\s*\d+%\);/g, "background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);");
    content = content.replace(/background:\s*linear-gradient\(135deg,\s*#[0-9A-Fa-f]+\s*\d+%,\s*#[0-9A-Fa-f]+\s*\d+%\);/g, "background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);");

    // 3. Remplacements pour le Glassmorphism (Les couleurs translucides blanches deviennent plus sombres pour contraster sur le fond blanc)
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.0[45]\)/g, 'rgba(255, 255, 255, 0.9)'); // bg for cards
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.1[0-9]*\)/g, 'rgba(0, 0, 0, 0.1)'); // borders and inputs
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.2[0-9]*\)/g, 'rgba(0, 0, 0, 0.15)'); // hover
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*\.0[45]\)/g, 'rgba(255, 255, 255, 0.9)'); // bg for cards (.04)
    content = content.replace(/rgba\(255,\s*255,\s*255,\s*\.1[0-9]*\)/g, 'rgba(0, 0, 0, 0.1)'); // borders (.1)

    // Backgrounds header fixes
    content = content.replace(/background:\s*rgba\(10,\s*5,\s*20,\s*\.92\);/g, 'background: rgba(255, 255, 255, 0.92);');
    content = content.replace(/background:\s*rgba\(5,\s*11,\s*26,\s*0\.92\);/g, 'background: rgba(255, 255, 255, 0.92);');
    content = content.replace(/background:\s*#120a1e;/g, 'background: #ffffff;');
    content = content.replace(/--glass-border:\s*rgba\([^)]+\);/g, '--glass-border: rgba(0, 0, 0, 0.1);');

    // Button shadows and special fixes for colors
    content = content.replace(/color:\s*#fff(?:fff)?;/g, 'color: #ffffff;'); // Enforce white text remains clearly white
    content = content.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\);/g, 'background: rgba(0, 0, 0, 0.03);'); // Internal sections

    fs.writeFileSync(file, content);
});

console.log("Les thèmes ont été mis à jour avec succès vers le thème clair.");
