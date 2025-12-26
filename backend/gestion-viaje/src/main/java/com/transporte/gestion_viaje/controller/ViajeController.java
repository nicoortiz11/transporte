package com.transporte.gestion_viaje.controller;

import com.transporte.gestion_viaje.model.Viaje;
import com.transporte.gestion_viaje.repository.ViajeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/viajes")
@CrossOrigin(origins = "*")
public class ViajeController {

    @Autowired
    private ViajeRepository viajeRepository;

    @GetMapping
    public List<Viaje> listarViajes() {
        return viajeRepository.findAll();
    }

    @PostMapping
    public Viaje guardarViaje(@RequestBody Viaje viaje) {
        return viajeRepository.save(viaje);
    }

    @DeleteMapping("/{id}")
    public void eliminarViaje(@PathVariable Long id) {
        viajeRepository.deleteById(id);
    }

    @PutMapping("/{id}")
    public Viaje actualizarViaje(@PathVariable Long id, @RequestBody Viaje viajeActualizado) {
        return viajeRepository.findById(id)
                .map(viaje -> {
                    // CAMBIO CLAVE: Ahora seteamos los dos clientes nuevos
                    viaje.setProductor(viajeActualizado.getProductor());
                    viaje.setTransportista(viajeActualizado.getTransportista());

                    viaje.setKilos(viajeActualizado.getKilos());

                    // Asegurate que en tu modelo Viaje.java se llame precioPorTonelada
                    // Si lo dejaste como precioPorKilo, cambiá esta línea:
                    viaje.setPrecioPorTonelada(viajeActualizado.getPrecioPorTonelada());

                    viaje.setMonto(viajeActualizado.getMonto());
                    viaje.setFecha(viajeActualizado.getFecha());
                    viaje.setEstado(viajeActualizado.getEstado());
                    viaje.setPorcentajeComision(viajeActualizado.getPorcentajeComision());
                    viaje.setIvaPorcentaje(viajeActualizado.getIvaPorcentaje());
                    viaje.setGananciaNeta(viajeActualizado.getGananciaNeta());

                    // También guardamos el monto neto que calculamos en el front
                    viaje.setMontoNeto(viajeActualizado.getMontoNeto());

                    viaje.setCartaDePorte(viajeActualizado.getCartaDePorte());

                    return viajeRepository.save(viaje);
                })
                .orElseGet(() -> {
                    viajeActualizado.setId(id);
                    return viajeRepository.save(viajeActualizado);
                });
    }
}