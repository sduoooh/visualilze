from tkinter import Tk, filedialog

def choose_file():
    root = Tk()
    root.withdraw()  
    file_path = filedialog.askopenfilename()
    root.destroy()
    return file_path

if __name__ == "__main__":
    file_path = choose_file()
    print(file_path)