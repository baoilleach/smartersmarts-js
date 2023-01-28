if __name__ == "__main__":
    with open("sortedbylength_100K.smi") as inp:
        with open("static/js/molecules.js", "w") as out:
            out.write("molecules = [\n")
            firstline = True
            for line in inp:
                if firstline:
                    firstline = False
                else:
                    out.write(",")
                smi = line.split()[0].replace("\\", "\\\\")
                out.write(f'"{smi}"')
            out.write("];")
