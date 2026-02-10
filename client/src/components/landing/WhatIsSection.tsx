const WhatIsSection = () => {
  return (
    <section id="product" className="py-20 px-6 border-t border-border">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-semibold text-foreground mb-8">
          What is CollabCode?
        </h2>

        <div className="space-y-6 text-muted-foreground text-lg leading-relaxed">
          <p>
            CollabCode is a browser-based collaborative code editor built for teams 
            who need to work together in real time.
          </p>

          <ul className="space-y-3 list-disc list-inside">
            <li>Multiple users can edit the same file at the same time</li>
            <li>Changes sync instantly across all connected sessions</li>
            <li>No installation or configuration required</li>
            <li>Designed for reliability and focus, not features you won't use</li>
          </ul>

          <p>
            Whether you're pair programming, reviewing code, or teaching—CollabCode 
            gives you a shared space to write and read code together.
          </p>
        </div>
      </div>
    </section>
  );
};

export default WhatIsSection;
