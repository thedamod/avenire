export type StudyDocument = {
  readonly id: string;
  readonly subject: string;
  readonly title: string;
  readonly sections: ReadonlyArray<{ readonly heading: string; readonly text: string }>;
};

export type QueryType = "paraphrase" | "keyword" | "cross-document" | "multi-hop";
export type BenchmarkQuery = {
  readonly id: string;
  readonly type: QueryType;
  readonly text: string;
  readonly relevant: ReadonlyArray<{
    readonly documentId: string;
    readonly headings?: ReadonlyArray<string>;
    readonly grade?: number;
  }>;
};

export const documents: ReadonlyArray<StudyDocument> = [
  {
    id: "history-schmidt",
    subject: "Mathematics history",
    title: "Gram-Schmidt process",
    sections: [
      {
        heading: "Publication",
        text: "The Gram-Schmidt orthogonalization process was published by Erhard Schmidt in 1907. It constructs an orthogonal basis from linearly independent vectors.",
      },
    ],
  },
  {
    id: "history-hilbert",
    subject: "Mathematics history",
    title: "Erhard Schmidt at Göttingen",
    sections: [
      {
        heading: "Mentorship",
        text: "Erhard Schmidt studied under David Hilbert at the University of Göttingen. Hilbert supervised Schmidt's doctoral work.",
      },
    ],
  },
  {
    id: "history-noether",
    subject: "Mathematics history",
    title: "Noether's theorem",
    sections: [
      {
        heading: "Discovery",
        text: "Emmy Noether proved Noether's theorem in 1915. It connects each continuous symmetry of an action with a conserved quantity.",
      },
    ],
  },
  {
    id: "history-erl",
    subject: "Mathematics history",
    title: "Emmy Noether's education",
    sections: [
      {
        heading: "Doctorate",
        text: "Emmy Noether earned her doctorate at the University of Erlangen under Paul Gordan. Her dissertation concerned algebraic invariants.",
      },
    ],
  },

  {
    id: "la-eigen",
    subject: "Linear algebra",
    title: "Eigenvalues and eigenvectors",
    sections: [
      {
        heading: "Invariant directions",
        text: "An eigenvector of a square matrix A is a nonzero vector v whose direction is unchanged by the transformation. The equation Av = lambda v defines the eigenvalue lambda. The vector may be stretched, compressed, or reversed, but it remains on the same line.",
      },
      {
        heading: "Finding eigenvalues",
        text: "A scalar lambda is an eigenvalue exactly when A - lambda I is singular. Thus det(A - lambda I) = 0 gives the characteristic polynomial. Its roots are the eigenvalues, and solving (A - lambda I)v = 0 gives the corresponding eigenspace.",
      },
    ],
  },
  {
    id: "la-least",
    subject: "Linear algebra",
    title: "Least squares and projection",
    sections: [
      {
        heading: "Overdetermined systems",
        text: "When Ax = b has no exact solution, least squares chooses x that minimizes the squared residual norm ||Ax - b||^2. At the minimum the residual b - Ax is perpendicular to every column of A.",
      },
      {
        heading: "Normal equations",
        text: "Orthogonality gives A transpose A x = A transpose b. If columns of A are independent, A transpose A is invertible and this equation has a unique solution. Geometrically, Ax is the orthogonal projection of b onto the column space.",
      },
    ],
  },
  {
    id: "la-rank",
    subject: "Linear algebra",
    title: "Rank, null space, and dimension",
    sections: [
      {
        heading: "Rank and nullity",
        text: "The rank of a matrix is the dimension of its column space, while its nullity is the dimension of the solutions to Ax = 0. For a matrix with n columns, rank plus nullity equals n.",
      },
      {
        heading: "Linear independence",
        text: "Columns are linearly independent precisely when the only coefficients producing their zero combination are all zero. A pivot in every column signals independence; a free variable signals a nontrivial null-space vector.",
      },
    ],
  },
  {
    id: "thermo-first",
    subject: "Thermodynamics",
    title: "First law and internal energy",
    sections: [
      {
        heading: "Energy accounting",
        text: "The first law states that energy is conserved. For a closed system, the change in internal energy equals heat added to the system minus work done by the system: delta U = Q - W. Sign conventions must be stated before applying the equation.",
      },
      {
        heading: "Path dependence",
        text: "Internal energy is a state function, so its change depends only on initial and final states. Heat and work depend on the path taken between those states. A cycle returns the system to its starting state and therefore has zero net change in internal energy.",
      },
    ],
  },
  {
    id: "thermo-entropy",
    subject: "Thermodynamics",
    title: "Entropy and the second law",
    sections: [
      {
        heading: "Entropy change",
        text: "For a reversible transfer of heat, the entropy change is dS = delta Q reversible divided by temperature. Entropy is a state function even though heat is path dependent.",
      },
      {
        heading: "Direction of spontaneous change",
        text: "The second law says the total entropy of an isolated system cannot decrease. Reversible processes leave total entropy unchanged; irreversible processes increase it. This gives a direction to natural processes that energy conservation alone cannot provide.",
      },
    ],
  },
  {
    id: "thermo-gas",
    subject: "Thermodynamics",
    title: "Ideal gases and heat capacity",
    sections: [
      {
        heading: "Equation of state",
        text: "An ideal gas obeys PV = nRT, relating pressure, volume, amount of substance, and absolute temperature. At fixed amount and temperature, pressure varies inversely with volume.",
      },
      {
        heading: "Heat capacity",
        text: "Heat capacity measures energy needed for a temperature increase. For an ideal gas, internal energy depends only on temperature. Molar heat capacities at constant volume and pressure differ because expansion at constant pressure also requires work.",
      },
    ],
  },
  {
    id: "cell-membrane",
    subject: "Cell biology",
    title: "Membranes and transport",
    sections: [
      {
        heading: "Selective barrier",
        text: "The cell membrane is a phospholipid bilayer with hydrophilic heads facing water and hydrophobic tails inward. It separates the cell from its surroundings while allowing selective exchange.",
      },
      {
        heading: "Passive and active transport",
        text: "Diffusion moves particles down a concentration gradient without direct energy input. Facilitated diffusion uses membrane proteins but still follows the gradient. Active transport moves substances against a gradient and requires energy, often from ATP.",
      },
    ],
  },
  {
    id: "cell-energy",
    subject: "Cell biology",
    title: "Cellular respiration",
    sections: [
      {
        heading: "Overall process",
        text: "Cellular respiration transfers energy from glucose to ATP. Glycolysis occurs in the cytosol and splits glucose into pyruvate, producing a small amount of ATP and reduced electron carriers.",
      },
      {
        heading: "Mitochondrial stages",
        text: "The citric acid cycle oxidizes acetyl groups and releases carbon dioxide. The electron transport chain in the inner mitochondrial membrane uses electron energy to pump protons. Their return through ATP synthase drives most ATP production.",
      },
    ],
  },
  {
    id: "cell-expression",
    subject: "Cell biology",
    title: "Gene expression: DNA to protein",
    sections: [
      {
        heading: "Transcription",
        text: "During transcription, RNA polymerase reads a DNA template and builds a complementary RNA molecule. In eukaryotes the initial transcript is processed before it leaves the nucleus.",
      },
      {
        heading: "Translation",
        text: "During translation, a ribosome reads messenger RNA codons. Transfer RNAs bring amino acids matching each codon, and the ribosome joins them into a polypeptide. The genetic code maps nucleotide triplets to amino acids.",
      },
    ],
  },
  {
    id: "algo-sort",
    subject: "Intro algorithms",
    title: "Sorting and asymptotic cost",
    sections: [
      {
        heading: "Growth rates",
        text: "Big O notation describes an asymptotic upper bound on resource growth as input size increases. It suppresses constant factors and lower-order terms, so it compares scaling rather than exact runtime on one machine.",
      },
      {
        heading: "Comparison sorting",
        text: "Merge sort divides an array, sorts each half, then merges the ordered halves in linear time. Its recurrence T(n) = 2T(n/2) + O(n) yields O(n log n) time. Insertion sort is simpler and can be effective on small or nearly sorted inputs, but has quadratic worst-case time.",
      },
    ],
  },
  {
    id: "algo-graphs",
    subject: "Intro algorithms",
    title: "Graph traversal",
    sections: [
      {
        heading: "Breadth-first search",
        text: "Breadth-first search explores a graph in layers from a start vertex, using a queue. In an unweighted graph it finds shortest paths measured by number of edges. With adjacency lists its running time is O(V + E).",
      },
      {
        heading: "Depth-first search",
        text: "Depth-first search follows one path as far as possible before backtracking, using recursion or an explicit stack. It supports cycle detection, connected component discovery, and topological sorting of directed acyclic graphs.",
      },
    ],
  },
];

export const queries: ReadonlyArray<BenchmarkQuery> = [
  {
    id: "m01",
    type: "multi-hop",
    text: "Under whom did the mathematician behind the Gram-Schmidt process study?",
    relevant: [{ documentId: "history-schmidt" }, { documentId: "history-hilbert" }],
  },
  {
    id: "m02",
    type: "multi-hop",
    text: "Which university trained the publisher of the Gram-Schmidt process?",
    relevant: [{ documentId: "history-schmidt" }, { documentId: "history-hilbert" }],
  },
  {
    id: "m03",
    type: "multi-hop",
    text: "Who supervised the mathematician who published Gram-Schmidt orthogonalization?",
    relevant: [{ documentId: "history-schmidt" }, { documentId: "history-hilbert" }],
  },
  {
    id: "m04",
    type: "multi-hop",
    text: "What was the doctoral relationship between Hilbert and the Gram-Schmidt author?",
    relevant: [{ documentId: "history-schmidt" }, { documentId: "history-hilbert" }],
  },
  {
    id: "m05",
    type: "multi-hop",
    text: "Under whom did the discoverer of the symmetry-conservation theorem earn a doctorate?",
    relevant: [{ documentId: "history-noether" }, { documentId: "history-erl" }],
  },
  {
    id: "m06",
    type: "multi-hop",
    text: "At which university did the author of Noether's theorem study for a doctorate?",
    relevant: [{ documentId: "history-noether" }, { documentId: "history-erl" }],
  },
  {
    id: "m07",
    type: "multi-hop",
    text: "Who advised the mathematician who connected continuous symmetry and conservation?",
    relevant: [{ documentId: "history-noether" }, { documentId: "history-erl" }],
  },
  {
    id: "m08",
    type: "multi-hop",
    text: "What was the dissertation field of the person behind Noether's theorem?",
    relevant: [{ documentId: "history-noether" }, { documentId: "history-erl" }],
  },

  {
    id: "p01",
    type: "paraphrase",
    text: "Which vectors keep pointing along their original line after a matrix acts on them?",
    relevant: [{ documentId: "la-eigen", headings: ["Invariant directions"] }],
  },
  {
    id: "p02",
    type: "paraphrase",
    text: "How do we pick the closest attainable output when measurements make the equations inconsistent?",
    relevant: [{ documentId: "la-least", headings: ["Overdetermined systems"] }],
  },
  {
    id: "p03",
    type: "paraphrase",
    text: "What balances the number of independent columns against solutions that vanish under the transformation?",
    relevant: [{ documentId: "la-rank", headings: ["Rank and nullity"] }],
  },
  {
    id: "p04",
    type: "paraphrase",
    text: "Which energy bookkeeping rule compares warming a closed system with energy it exchanges and mechanical effort it delivers?",
    relevant: [{ documentId: "thermo-first", headings: ["Energy accounting"] }],
  },
  {
    id: "p05",
    type: "paraphrase",
    text: "What quantity tells whether change can happen on its own in an isolated world?",
    relevant: [{ documentId: "thermo-entropy", headings: ["Direction of spontaneous change"] }],
  },
  {
    id: "p06",
    type: "paraphrase",
    text: "How are gas pressure and container size connected when the sample stays warm and fixed?",
    relevant: [{ documentId: "thermo-gas", headings: ["Equation of state"] }],
  },
  {
    id: "p07",
    type: "paraphrase",
    text: "What lets a cell take in a substance even when more of it is already inside?",
    relevant: [{ documentId: "cell-membrane", headings: ["Passive and active transport"] }],
  },
  {
    id: "p08",
    type: "paraphrase",
    text: "Where do cells harvest most usable chemical energy from food?",
    relevant: [{ documentId: "cell-energy", headings: ["Mitochondrial stages"] }],
  },
  {
    id: "p09",
    type: "paraphrase",
    text: "How does a nucleotide message specify the order of building blocks in a protein?",
    relevant: [{ documentId: "cell-expression", headings: ["Translation"] }],
  },
  {
    id: "p10",
    type: "paraphrase",
    text: "Which procedure guarantees minimum-hop routes when every connection has equal cost?",
    relevant: [{ documentId: "algo-graphs", headings: ["Breadth-first search"] }],
  },
  {
    id: "p11",
    type: "paraphrase",
    text: "How should we describe how computation grows as the input becomes very large?",
    relevant: [{ documentId: "algo-sort", headings: ["Growth rates"] }],
  },
  {
    id: "p12",
    type: "paraphrase",
    text: "What molecular machine assembles a chain by matching carried building blocks to message triplets?",
    relevant: [{ documentId: "cell-expression", headings: ["Translation"] }],
  },
  {
    id: "k01",
    type: "keyword",
    text: "characteristic polynomial determinant eigenvalue eigenspace",
    relevant: [{ documentId: "la-eigen", headings: ["Finding eigenvalues"] }],
  },
  {
    id: "k02",
    type: "keyword",
    text: "normal equations orthogonal projection residual",
    relevant: [{ documentId: "la-least", headings: ["Normal equations"] }],
  },
  {
    id: "k03",
    type: "keyword",
    text: "pivot free variable nullity rank",
    relevant: [
      { documentId: "la-rank", headings: ["Linear independence"] },
      { documentId: "la-rank", headings: ["Rank and nullity"] },
    ],
  },
  {
    id: "k04",
    type: "keyword",
    text: "delta U Q W closed system first law",
    relevant: [{ documentId: "thermo-first", headings: ["Energy accounting"] }],
  },
  {
    id: "k05",
    type: "keyword",
    text: "reversible entropy isolated irreversible second law",
    relevant: [{ documentId: "thermo-entropy", headings: ["Direction of spontaneous change"] }],
  },
  {
    id: "k06",
    type: "keyword",
    text: "PV nRT ideal gas temperature volume",
    relevant: [{ documentId: "thermo-gas", headings: ["Equation of state"] }],
  },
  {
    id: "k07",
    type: "keyword",
    text: "phospholipid bilayer hydrophilic hydrophobic",
    relevant: [{ documentId: "cell-membrane", headings: ["Selective barrier"] }],
  },
  {
    id: "k08",
    type: "keyword",
    text: "glycolysis pyruvate cytosol ATP",
    relevant: [{ documentId: "cell-energy", headings: ["Overall process"] }],
  },
  {
    id: "k09",
    type: "keyword",
    text: "RNA polymerase DNA template transcription",
    relevant: [{ documentId: "cell-expression", headings: ["Transcription"] }],
  },
  {
    id: "k10",
    type: "keyword",
    text: "merge sort recurrence O(n log n)",
    relevant: [{ documentId: "algo-sort", headings: ["Comparison sorting"] }],
  },
  {
    id: "k11",
    type: "keyword",
    text: "BFS queue O(V + E) shortest paths",
    relevant: [{ documentId: "algo-graphs", headings: ["Breadth-first search"] }],
  },
  {
    id: "k12",
    type: "keyword",
    text: "T(n) = 2T(n/2) divide merge",
    relevant: [{ documentId: "algo-sort", headings: ["Comparison sorting"] }],
  },
  {
    id: "x01",
    type: "cross-document",
    text: "Compare how a gradient directs movement across membranes and how entropy constrains spontaneous change.",
    relevant: [
      { documentId: "cell-membrane", headings: ["Passive and active transport"] },
      { documentId: "thermo-entropy", headings: ["Direction of spontaneous change"] },
    ],
  },
  {
    id: "x02",
    type: "cross-document",
    text: "Which two methods find shortest or efficient routes, one in a graph and one among candidate solutions?",
    relevant: [
      { documentId: "algo-graphs", headings: ["Breadth-first search"] },
      { documentId: "la-least", headings: ["Normal equations"] },
    ],
  },
  {
    id: "x03",
    type: "cross-document",
    text: "Relate energy transfer by heat to the energy conversion that powers cellular work.",
    relevant: [
      { documentId: "thermo-first", headings: ["Energy accounting"] },
      { documentId: "cell-energy", headings: ["Mitochondrial stages"] },
    ],
  },
  {
    id: "x04",
    type: "cross-document",
    text: "Compare how a matrix transformation has special directions with how a gene message is read in groups.",
    relevant: [
      { documentId: "la-eigen", headings: ["Invariant directions"] },
      { documentId: "cell-expression", headings: ["Translation"] },
    ],
  },
  {
    id: "x05",
    type: "cross-document",
    text: "What kinds of constraints reveal structure, from independent variables in equations to bounds on algorithm growth?",
    relevant: [
      { documentId: "la-rank", headings: ["Rank and nullity"] },
      { documentId: "algo-sort", headings: ["Growth rates"] },
    ],
  },
  {
    id: "x06",
    type: "cross-document",
    text: "Contrast processes that need an energy source with those that proceed down a natural direction.",
    relevant: [
      { documentId: "cell-membrane", headings: ["Passive and active transport"] },
      { documentId: "thermo-entropy", headings: ["Direction of spontaneous change"] },
    ],
  },
  {
    id: "x07",
    type: "cross-document",
    text: "Find examples where a cyclic or repeated process can be described by a compact mathematical rule.",
    relevant: [
      { documentId: "thermo-first", headings: ["Path dependence"] },
      { documentId: "algo-sort", headings: ["Comparison sorting"] },
    ],
  },
  {
    id: "x08",
    type: "cross-document",
    text: "How do local components cooperate to produce a system-level result in a cell and in a graph?",
    relevant: [
      { documentId: "cell-energy", headings: ["Mitochondrial stages"] },
      { documentId: "algo-graphs", headings: ["Breadth-first search"] },
    ],
  },
  {
    id: "x09",
    type: "cross-document",
    text: "Compare a molecule storing usable potential with a matrix representation storing geometric information.",
    relevant: [
      { documentId: "cell-energy", headings: ["Overall process"] },
      { documentId: "la-eigen", headings: ["Invariant directions"] },
    ],
  },
  {
    id: "x10",
    type: "cross-document",
    text: "Which approaches use a staged process to turn a complicated input into a simpler output?",
    relevant: [
      { documentId: "algo-sort", headings: ["Comparison sorting"] },
      { documentId: "cell-expression", headings: ["Transcription", "Translation"] },
    ],
  },
];
