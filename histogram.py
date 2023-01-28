import json

if __name__ == "__main__":
    # Read the frequencies of each atom type
    freqs = {}
    tot = 0
    with open("histogram.txt") as inp:
        for line in inp:
            d = line.rstrip().split()
            text = ",".join(d[:6])
            freq = int(d[6])
            freqs[text] = freq
            tot += freq
    # Write out the probabilities of each atom type
    with open("static/js/histogram.js", "w") as out:
        out.write("probabilities = {\n")
        firstline = True
        for text, freq in freqs.items():
            if not firstline:
                out.write(",\n")
            else:
                firstline = False
            oline = f"'[{text}]':{freq/tot}"
            out.write(oline)
        out.write("}\n")
